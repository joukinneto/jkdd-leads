type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        contacts?: Array<{
          profile?: { name?: string };
          wa_id?: string;
        }>;
        messages?: Array<{
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          image?: { id?: string; mime_type?: string; sha256?: string; caption?: string };
          document?: { id?: string; filename?: string; mime_type?: string; sha256?: string; caption?: string };
          audio?: { id?: string; mime_type?: string; sha256?: string; voice?: boolean };
          video?: { id?: string; mime_type?: string; sha256?: string; caption?: string };
          location?: { latitude?: number; longitude?: number; name?: string; address?: string };
          interactive?: Record<string, unknown>;
          button?: Record<string, unknown>;
        }>;
        statuses?: Array<{
          id?: string;
          status?: string;
          timestamp?: string;
          recipient_id?: string;
          errors?: Array<Record<string, unknown>>;
        }>;
      };
    }>;
  }>;
};

type NormalizedEvent =
  | {
      kind: "message";
      eventId: string;
      phoneNumberId: string | null;
      from: string | null;
      customerName: string | null;
      timestamp: string | null;
      messageType: string;
      text: string | null;
      rawMessage: Record<string, unknown>;
    }
  | {
      kind: "status";
      eventId: string;
      phoneNumberId: string | null;
      recipientId: string | null;
      timestamp: string | null;
      status: string;
      rawStatus: Record<string, unknown>;
    };

const encoder = new TextEncoder();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Hex(secret: string, data: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, data);
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyMetaSignature(req: Request, rawBody: Uint8Array): Promise<boolean> {
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appSecret) {
    // Development/Test may begin without signature enforcement while wiring credentials,
    // but Production must require META_APP_SECRET before enablement.
    return true;
  }

  const header = req.headers.get("x-hub-signature-256");
  if (!header?.startsWith("sha256=")) return false;

  const provided = header.slice("sha256=".length).toLowerCase();
  const expected = await hmacSha256Hex(appSecret, rawBody);
  return timingSafeEqualHex(provided, expected);
}

function normalizePayload(payload: MetaWebhookPayload): NormalizedEvent[] {
  const normalized: NormalizedEvent[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value ?? {};
      const phoneNumberId = value.metadata?.phone_number_id ?? null;
      const contactsByWaId = new Map(
        (value.contacts ?? []).map((contact) => [
          contact.wa_id ?? "",
          contact.profile?.name ?? null,
        ]),
      );

      for (const message of value.messages ?? []) {
        const from = message.from ?? null;
        const messageType = message.type ?? "unknown";
        const text = message.text?.body ?? null;
        const eventId = message.id ?? `${entry.id ?? "entry"}:${message.timestamp ?? crypto.randomUUID()}`;

        normalized.push({
          kind: "message",
          eventId,
          phoneNumberId,
          from,
          customerName: from ? contactsByWaId.get(from) ?? null : null,
          timestamp: message.timestamp ?? null,
          messageType,
          text,
          rawMessage: message as unknown as Record<string, unknown>,
        });
      }

      for (const status of value.statuses ?? []) {
        const eventId = status.id
          ? `${status.id}:${status.status ?? "unknown"}:${status.timestamp ?? ""}`
          : `${entry.id ?? "entry"}:status:${crypto.randomUUID()}`;

        normalized.push({
          kind: "status",
          eventId,
          phoneNumberId,
          recipientId: status.recipient_id ?? null,
          timestamp: status.timestamp ?? null,
          status: status.status ?? "unknown",
          rawStatus: status as unknown as Record<string, unknown>,
        });
      }
    }
  }

  return normalized;
}

async function handleVerification(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");

  if (!expectedToken) {
    return jsonResponse({ error: "webhook_not_configured" }, 503);
  }

  if (mode === "subscribe" && verifyToken === expectedToken && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return jsonResponse({ error: "verification_failed" }, 403);
}

async function handleWebhook(req: Request): Promise<Response> {
  const rawBody = new Uint8Array(await req.arrayBuffer());

  if (!(await verifyMetaSignature(req, rawBody))) {
    return jsonResponse({ error: "invalid_signature" }, 401);
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  if (payload.object !== "whatsapp_business_account") {
    return jsonResponse({ received: true, ignored: true });
  }

  const events = normalizePayload(payload);

  // Wave 02 boundary:
  // Do not persist or invoke AI yet. The next service layer will consume these
  // normalized events with tenant resolution, idempotency and audit guarantees.
  console.info("whatsapp_webhook_received", {
    eventCount: events.length,
    messageCount: events.filter((event) => event.kind === "message").length,
    statusCount: events.filter((event) => event.kind === "status").length,
  });

  return jsonResponse({
    received: true,
    eventCount: events.length,
  });
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "GET") return await handleVerification(req);
    if (req.method === "POST") return await handleWebhook(req);
    return jsonResponse({ error: "method_not_allowed" }, 405);
  } catch (error) {
    console.error("whatsapp_webhook_unhandled_error", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unhandled error",
    });
    return jsonResponse({ error: "internal_error" }, 500);
  }
});

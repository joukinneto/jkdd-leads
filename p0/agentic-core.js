(function (root) {
  "use strict";

  const VERSION = "0.1.0";

  function iso(value) {
    const d = value instanceof Date ? value : new Date(value || Date.now());
    if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
    return d.toISOString();
  }

  function text(value) {
    return String(value == null ? "" : value).trim().replace(/\s+/g, " ");
  }

  function normalizeEmail(value) {
    return text(value).toLowerCase();
  }

  function normalizePhone(value) {
    const digits = String(value == null ? "" : value).replace(/\D/g, "");
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  function normalizeKey(value) {
    return text(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function fingerprint(input) {
    const email = normalizeEmail(input.email);
    if (email) return "email:" + email;

    const phone = normalizePhone(input.phone);
    if (phone) return "phone:" + phone;

    const name = normalizeKey(input.name);
    const location = normalizeKey(input.location);
    if (!name) throw new Error("Lead requires name, email, or phone");
    return "name-location:" + name + "|" + location;
  }

  function createState() {
    return {
      version: VERSION,
      leads: [],
      evidence: [],
      tasks: [],
      audit: []
    };
  }

  function nextId(prefix, collection) {
    const n = collection.length + 1;
    return prefix + "-" + String(n).padStart(5, "0");
  }

  function audit(state, type, entityType, entityId, payload, at) {
    const event = {
      id: nextId("EVT", state.audit),
      type,
      entityType,
      entityId,
      payload: payload || {},
      occurredAt: iso(at)
    };
    state.audit.push(event);
    return event;
  }

  function ingestLead(state, input, options) {
    options = options || {};
    const at = iso(options.now);
    const fp = fingerprint(input);
    const existing = state.leads.find((lead) => lead.fingerprint === fp);

    if (existing) {
      existing.updatedAt = at;
      audit(state, "lead.duplicate_detected", "lead", existing.id, {
        fingerprint: fp,
        incomingSource: options.source || input.source || "unknown"
      }, at);
      return { lead: existing, duplicate: true };
    }

    const lead = {
      id: nextId("LD", state.leads),
      fingerprint: fp,
      name: text(input.name),
      phone: normalizePhone(input.phone),
      email: normalizeEmail(input.email),
      service: text(input.service),
      location: text(input.location),
      urgency: text(input.urgency).toLowerCase(),
      budget: text(input.budget).toLowerCase(),
      source: text(options.source || input.source || "manual"),
      status: "NEW",
      score: 0,
      band: "LOW",
      qualificationReasons: [],
      createdAt: at,
      updatedAt: at
    };

    state.leads.push(lead);
    audit(state, "lead.ingested", "lead", lead.id, {
      fingerprint: fp,
      source: lead.source
    }, at);

    return { lead, duplicate: false };
  }

  function getLead(state, leadId) {
    const lead = state.leads.find((item) => item.id === leadId);
    if (!lead) throw new Error("Lead not found: " + leadId);
    return lead;
  }

  function recordEvidence(state, input, options) {
    options = options || {};
    getLead(state, input.leadId);

    const allowed = new Set(["candidate", "corroborated", "accepted", "rejected"]);
    const strength = text(input.strength || "candidate").toLowerCase();
    if (!allowed.has(strength)) throw new Error("Invalid evidence strength");
    if (!text(input.field)) throw new Error("Evidence field is required");
    if (!text(input.sourceType)) throw new Error("Evidence sourceType is required");

    const recordedAt = iso(options.now);
    const item = {
      id: nextId("EVD", state.evidence),
      leadId: input.leadId,
      field: text(input.field),
      value: input.value,
      sourceType: text(input.sourceType),
      sourceRef: text(input.sourceRef),
      strength,
      observedAt: iso(input.observedAt || recordedAt),
      recordedAt
    };

    state.evidence.push(item);
    audit(state, "evidence.recorded", "lead", input.leadId, {
      evidenceId: item.id,
      field: item.field,
      sourceType: item.sourceType,
      strength: item.strength
    }, recordedAt);

    return item;
  }

  function qualificationBand(score) {
    if (score >= 80) return "HOT";
    if (score >= 60) return "WARM";
    if (score >= 35) return "NURTURE";
    return "LOW";
  }

  function qualifyLead(state, leadId, options) {
    options = options || {};
    const lead = getLead(state, leadId);
    let score = 0;
    const reasons = [];

    function add(points, reason) {
      score += points;
      reasons.push({ points, reason });
    }

    if (lead.service) add(30, "service provided");
    if (lead.location) add(15, "location provided");

    if (lead.urgency === "now") add(20, "urgent start");
    else if (lead.urgency === "30d") add(12, "start within 30 days");
    else if (lead.urgency) add(5, "future timing provided");

    if (lead.budget === "clear") add(15, "budget is clear");
    if (lead.phone) add(10, "phone available");
    if (lead.email) add(5, "email available");

    const trustedEvidence = state.evidence.some((item) =>
      item.leadId === leadId &&
      (item.strength === "accepted" || item.strength === "corroborated")
    );
    if (trustedEvidence) add(5, "accepted/corroborated evidence exists");

    score = Math.min(score, 100);
    lead.score = score;
    lead.band = qualificationBand(score);
    lead.qualificationReasons = reasons;
    lead.status = score >= 60 ? "QUALIFIED" : "NEW";
    lead.updatedAt = iso(options.now);

    audit(state, "lead.qualified", "lead", leadId, {
      score,
      band: lead.band,
      reasons
    }, options.now);

    return {
      leadId,
      score,
      band: lead.band,
      reasons
    };
  }

  function enqueueTask(state, input, options) {
    options = options || {};
    getLead(state, input.leadId);

    const kind = text(input.kind || "WORK").toUpperCase();
    const reason = text(input.reason);
    if ((kind === "RECHECK" || kind === "FOLLOW_UP") && !reason) {
      throw new Error(kind + " task requires an explicit reason");
    }

    const task = {
      id: nextId("TSK", state.tasks),
      leadId: input.leadId,
      kind,
      reason,
      payload: input.payload || {},
      priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 50,
      dueAt: iso(input.dueAt || options.now),
      status: "pending",
      leaseOwner: null,
      leaseUntil: null,
      attempts: 0,
      createdAt: iso(options.now),
      updatedAt: iso(options.now)
    };

    state.tasks.push(task);
    audit(state, "task.enqueued", "task", task.id, {
      leadId: task.leadId,
      kind: task.kind,
      dueAt: task.dueAt,
      reason: task.reason
    }, options.now);
    return task;
  }

  function scheduleRecheck(state, input, options) {
    return enqueueTask(state, {
      leadId: input.leadId,
      kind: "RECHECK",
      reason: input.reason,
      dueAt: input.dueAt,
      priority: input.priority == null ? 40 : input.priority,
      payload: input.payload || {}
    }, options);
  }

  function isLeaseExpired(task, nowMs) {
    if (!task.leaseUntil) return true;
    return new Date(task.leaseUntil).getTime() <= nowMs;
  }

  function claimDueTasks(state, input) {
    const workerId = text(input && input.workerId);
    if (!workerId) throw new Error("workerId is required");

    const now = iso(input && input.now);
    const nowMs = new Date(now).getTime();
    const limit = Math.max(1, Number((input && input.limit) || 10));
    const leaseMs = Math.max(1000, Number((input && input.leaseMs) || 300000));

    const candidates = state.tasks
      .filter((task) => {
        const due = new Date(task.dueAt).getTime() <= nowMs;
        const claimable =
          task.status === "pending" ||
          (task.status === "leased" && isLeaseExpired(task, nowMs));
        return due && claimable;
      })
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      })
      .slice(0, limit);

    const leaseUntil = new Date(nowMs + leaseMs).toISOString();

    for (const task of candidates) {
      task.status = "leased";
      task.leaseOwner = workerId;
      task.leaseUntil = leaseUntil;
      task.attempts += 1;
      task.updatedAt = now;
      audit(state, "task.leased", "task", task.id, {
        workerId,
        leaseUntil,
        attempt: task.attempts
      }, now);
    }

    return candidates;
  }

  function completeTask(state, input) {
    const task = state.tasks.find((item) => item.id === input.taskId);
    if (!task) throw new Error("Task not found: " + input.taskId);
    if (task.status !== "leased") throw new Error("Task is not leased");
    if (task.leaseOwner !== input.workerId) throw new Error("Worker does not own task lease");

    const at = iso(input.now);
    task.status = "completed";
    task.leaseOwner = null;
    task.leaseUntil = null;
    task.updatedAt = at;
    task.result = input.result || {};

    audit(state, "task.completed", "task", task.id, {
      workerId: input.workerId,
      result: task.result
    }, at);

    return task;
  }

  function recordConciergeAction(state, input) {
    getLead(state, input.leadId);
    const action = {
      channel: text(input.channel || "manual"),
      action: text(input.action),
      outcome: text(input.outcome),
      reviewedByHuman: input.reviewedByHuman !== false
    };

    if (!action.action) throw new Error("Concierge action is required");

    audit(state, "concierge.action_recorded", "lead", input.leadId, action, input.now);
    return action;
  }

  const api = {
    VERSION,
    createState,
    normalizeEmail,
    normalizePhone,
    fingerprint,
    ingestLead,
    recordEvidence,
    qualifyLead,
    enqueueTask,
    scheduleRecheck,
    claimDueTasks,
    completeTask,
    recordConciergeAction
  };

  root.JKDDLeadsP0 = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

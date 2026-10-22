# ADR-001 — WhatsApp server-side runtime for JKDD Leads

Status: ACCEPTED FOR DEVELOPMENT/TEST ONLY

Date: 2026-09-08 ET

Production: UNTOUCHED

## Context

JKDD Leads requires a server-side webhook for WhatsApp Business Cloud API. GitHub Pages cannot safely receive private webhooks or hold runtime secrets.

JKDD TECH Foundation already defines Supabase as the shared backend platform and PostgreSQL through Supabase as the relational persistence layer.

## Decision

Use a Supabase Edge Function as the first Development/Test runtime for the WhatsApp webhook.

This decision is intentionally narrow:

- it does not authorize Production deployment;
- it does not authorize database migrations;
- it does not authorize RLS/RBAC changes;
- it does not authorize secret creation or rotation;
- it does not lock the AI provider to Supabase or any specific model vendor.

## Why

- aligns with existing JKDD TECH Foundation backend direction;
- provides server-side secret isolation;
- supports webhook-style HTTP handling;
- keeps the public GitHub Pages site static and free;
- avoids introducing an additional backend platform before necessary.

## Runtime responsibilities

The function is responsible for:

1. Meta webhook verification;
2. request signature verification when `META_APP_SECRET` is configured;
3. event parsing/normalization;
4. idempotency key extraction/preparation;
5. fast `200` acknowledgement;
6. forwarding normalized events to application services in later waves;
7. never logging tokens, secrets or raw sensitive payloads unnecessarily.

## Environment variables

Expected server-side variables:

- `WHATSAPP_VERIFY_TOKEN`
- `META_APP_SECRET`
- later: WhatsApp access token / phone number id through a secret-safe outbound adapter

These values must never be committed to GitHub or exposed in GitHub Pages JavaScript.

## Rollback

Because this ADR applies only to Development/Test source code, rollback is performed by reverting the branch/PR. No Production state is changed by this ADR.

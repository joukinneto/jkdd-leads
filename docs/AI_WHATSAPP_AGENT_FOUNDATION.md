# JKDD Leads — AI WhatsApp Agent Foundation

Status: Development/Test

Production: UNTOUCHED

Canonical governance: `🥇 JKDD Leads — 01.0 — Foundation Principal — Governança e Integração`

## 1. Purpose

Transform JKDD Leads from a passive lead registry into an AI-assisted lead acquisition, qualification, routing and conversion platform, initially through WhatsApp Business Cloud API.

The agent is not the source of truth. The platform is.

**Core rule:**

`ONE LEAD → ONE CANONICAL RECORD → MULTIPLE PRODUCT VIEWS`

**Decision rule:**

`AI CONVERSES → DETERMINISTIC SERVICES GOVERN → AUDIT RECORDS`

## 2. Product boundary

JKDD Leads owns:

- lead capture;
- conversation orchestration;
- lead qualification;
- lead scoring;
- lead routing;
- follow-up state;
- scheduling intent and booking orchestration;
- human handoff;
- lead conversion measurement.

JKDD TECH Foundation remains owner of shared platform capabilities:

- Authentication;
- Session;
- Identity;
- Companies/Tenants;
- Memberships;
- RBAC;
- RLS;
- Audit;
- Storage;
- Settings;
- i18n.

These capabilities must be reused and not reimplemented locally.

## 3. Reference flow

```text
Customer
  |
  v
WhatsApp Business Cloud API
  |
  v
Inbound Webhook
  |
  v
Conversation Orchestrator
  |-----------------------------|
  |              |              |
  v              v              v
AI Provider   Lead Engine   Business Knowledge
Adapter       + Scoring     + Policies
  |              |              |
  |--------------|--------------|
                 |
                 v
        Canonical Lead Record
                 |
        |--------|---------|
        v        v         v
    Routing  Scheduling  Human Handoff
        |        |         |
        |--------|---------|
                 v
           Outbound Reply
                 |
                 v
             WhatsApp
```

## 4. Guardrails

The AI must never independently invent or certify:

- prices;
- discounts;
- business hours;
- service availability;
- appointment availability;
- company policies;
- service areas;
- legal/compliance statements;
- payment status;
- user permissions.

Those values must be retrieved from canonical application services or explicitly configured company knowledge.

If required information is unavailable, the agent must either:

1. ask a concise clarification question;
2. explain that the information needs confirmation; or
3. hand off to a human.

## 5. Conversation memory model

### 5.1 Short-term context
Only the recent messages required to understand the current exchange.

### 5.2 Rolling summary
Incremental summary of the active conversation, updated after meaningful changes.

### 5.3 Structured lead memory
Canonical fields, not free-form model memory:

- lead_id;
- company_id;
- customer_name;
- phone;
- email;
- service_requested;
- service_category;
- property/project location;
- service_area_match;
- urgency;
- target_date;
- budget_range when appropriate;
- source/channel;
- photos/documents references;
- qualification status;
- lead score;
- assigned team/user;
- next action;
- consent/preferences where applicable.

### 5.4 Immutable conversation history
Inbound/outbound messages and important system events retained for traceability and audit according to platform policy.

## 6. Business Knowledge per company

The agent must use tenant-scoped knowledge.

Recommended domains:

- `company_profile`
- `services`
- `service_areas`
- `pricing_rules`
- `business_hours`
- `scheduling_rules`
- `faq`
- `policies`
- `brand_voice`
- `escalation_rules`
- `lead_routing_rules`

Knowledge must be versioned and attributable to a company/tenant.

## 7. Lead qualification

The agent should minimize friction and collect only the fields needed for the current service.

Default qualification dimensions:

- what the customer needs;
- service type;
- project/property location;
- urgency;
- preferred date/time;
- budget only when relevant;
- media/documents when useful;
- decision-maker/contact information;
- source attribution.

Do not force a fixed questionnaire when the information is already present in the conversation.

## 8. Lead scoring

Lead Score must be explainable and rule-governed. AI may extract signals, but scoring logic should be deterministic.

Possible inputs:

- service fit;
- geographic fit;
- urgency;
- project value band;
- completeness of information;
- engagement level;
- scheduling intent;
- existing customer status;
- spam/fraud indicators.

The score must store reason codes so a user can understand why the lead received that score.

## 9. Lead lifecycle

Suggested baseline states:

`NEW → ENGAGED → QUALIFYING → QUALIFIED → SCHEDULED → WON`

Alternative exits:

`LOST`

`HUMAN_HANDOFF`

`DISQUALIFIED`

State transitions must be validated by application logic, not invented by the model.

## 10. Scheduling architecture

Use a provider adapter instead of coupling JKDD Leads directly to one scheduler.

Required capabilities:

- check availability;
- present valid slots;
- create booking;
- reschedule;
- cancel when authorized;
- attach lead/customer metadata;
- preserve external booking id;
- log action in audit trail.

Initial adapters can include Google Calendar or another zero/low-cost provider approved for Development/Test. The domain contract must remain provider-neutral.

## 11. WhatsApp integration

GitHub Pages remains suitable for the public/static site and demo UI, but it cannot host the private webhook runtime or secrets.

Server-side components must handle:

- Meta webhook verification;
- message signature/verification where applicable;
- inbound event normalization;
- idempotency;
- outbound message calls;
- retry strategy;
- media metadata handling;
- delivery/read status events;
- rate limits;
- secret isolation.

No Meta token, AI provider key, app secret or verification secret may be committed to the repository or exposed in frontend JavaScript.

## 12. AI provider architecture

Use a provider adapter so the product is not locked to one vendor.

Contract should support:

- model selection by environment/company policy;
- structured output;
- tool/function calls;
- token/cost metrics;
- retry/fallback policy;
- provider/model audit metadata;
- safety and timeout handling.

OpenRouter may be supported later as an optional gateway, but is not a required architectural dependency.

## 13. Human handoff

Escalation must be available when:

- customer requests a person;
- confidence is low;
- policy requires manual approval;
- pricing exception is requested;
- complaint/high-risk language is detected;
- the requested service is outside known rules;
- repeated conversation failure occurs.

Handoff must preserve the conversation summary, structured lead state and reason for escalation.

## 14. Audit and observability

Each consequential action should record:

- timestamp;
- company_id;
- lead_id;
- conversation_id;
- event type;
- actor (`customer`, `agent`, `human`, `system`);
- model/provider metadata when applicable;
- rule/action invoked;
- result;
- error/retry state;
- handoff reason when applicable.

## 15. Development/Test deployment rule

- `main`/Production behavior remains untouched unless explicitly authorized.
- Work proceeds on dedicated Development/Test branches.
- GitHub Pages may host static UI/demo only.
- Backend runtime must be server-side and secret-safe.
- No database migration, RLS/RBAC alteration, secret creation or production deploy is authorized by this document alone.

## 16. Wave plan

### Wave 01 — Foundation
- architecture and contracts;
- business knowledge schema;
- agent guardrails;
- conversation state model;
- acceptance tests.

### Wave 02 — WhatsApp transport
- webhook receiver;
- inbound normalization;
- outbound reply adapter;
- idempotency and event log.

### Wave 03 — AI orchestration
- provider adapter;
- system instruction assembly;
- structured extraction;
- deterministic tool calls.

### Wave 04 — Lead intelligence
- qualification;
- structured memory;
- score engine;
- routing engine.

### Wave 05 — Scheduling and handoff
- availability contract;
- booking adapter;
- human escalation.

### Wave 06 — QA / Demo company
- test personas;
- adversarial scenarios;
- conversation replay;
- metrics dashboard;
- production readiness review.

## 17. Definition of done for Foundation

Foundation is complete when:

- architecture is documented;
- tenant-scoped knowledge contract is defined;
- prohibited AI behavior is explicit;
- canonical lead memory is defined;
- provider-neutral scheduling and AI contracts are defined;
- test cases cover normal, ambiguous and failure paths;
- no production state is changed.

# JKDD Leads — AI Business Knowledge Contract

Status: Development/Test

This document defines the tenant-scoped knowledge the AI agent may use. It is a product contract, not a database migration authorization.

## Principles

1. Knowledge is scoped by `company_id`.
2. Canonical business data overrides free-form prompt text.
3. The model must not manufacture missing values.
4. Every knowledge domain should be versionable and auditable.
5. Sensitive actions remain permission- and policy-gated.

## Knowledge domains

### company_profile
- legal/display name
- short description
- contact channels
- brand name
- primary language
- supported languages

### services
For each service:
- service key
- display name
- description
- active/inactive
- qualification fields required
- allowed service areas
- booking eligibility
- pricing mode (`fixed`, `range`, `estimate_only`, `manual_quote`)

### service_areas
- country/state/region/city/postal coverage as applicable
- inclusion/exclusion rules
- travel or distance constraints where configured

### pricing_rules
- service key
- pricing mode
- approved public price/range when permitted
- minimum charge when applicable
- variables that require manual quote
- discount policy
- explicit statement of what AI may and may not quote

### business_hours
- timezone
- regular weekly hours
- holidays/closures
- after-hours behavior

### scheduling_rules
- appointment types
- duration
- buffers
- lead-time rules
- cancellation/reschedule rules
- booking eligibility
- required qualification fields before booking

### faq
- question variants
- approved answer
- service/company scope
- last reviewed metadata

### policies
- payment policy
- cancellation policy
- estimate policy
- warranty policy when applicable
- customer communication policy
- prohibited commitments

### brand_voice
- tone
- level of formality
- greeting style
- message length target
- emoji policy
- language switching rules

### escalation_rules
- explicit customer request for human
- low confidence
- pricing exception
- complaint/dispute
- unsupported service
- repeated misunderstanding
- policy-sensitive scenario

### lead_routing_rules
- service → team/user
- geography → team/user
- lead score thresholds
- language preference
- workload/availability rules where supported

## Recommended normalized payload

```json
{
  "company_id": "company_uuid",
  "version": 1,
  "effective_at": "2026-09-08T00:00:00Z",
  "company_profile": {},
  "services": [],
  "service_areas": [],
  "pricing_rules": [],
  "business_hours": {},
  "scheduling_rules": [],
  "faq": [],
  "policies": {},
  "brand_voice": {},
  "escalation_rules": [],
  "lead_routing_rules": []
}
```

## Runtime behavior

Before responding to a question that depends on business facts, the orchestrator should identify the relevant domain and retrieve canonical knowledge for the active company.

Examples:

- `How much is it?` → `services` + `pricing_rules`
- `Do you work in Miami?` → `service_areas`
- `Do you have time tomorrow?` → `scheduling_rules` + live scheduling adapter
- `What is your warranty?` → `policies`

If live availability is required, static knowledge alone is insufficient. The agent must invoke the scheduling service.

## Prompt assembly rule

The system instruction should contain behavior and guardrails. Dynamic business facts should be injected from the knowledge service/tool layer whenever possible instead of being permanently copied into one giant prompt.

This reduces stale information and makes tenant updates safer.

## Change governance

Updating knowledge may change agent behavior without rebuilding the application, but the update must still preserve:

- tenant isolation;
- auditability;
- validation;
- rollback/version history;
- authorization.

Production data/schema changes require separate explicit authorization.

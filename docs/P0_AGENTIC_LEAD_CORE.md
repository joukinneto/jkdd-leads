# JKDD Leads — P0 Agentic Lead Core

Issue: #8  
Environment: Development/Test only  
Production: 🔒 UNTOUCHED  
Budget target: US$ 0  
Upstream architecture reference: `trycompai/crm` (MIT)

## 1. Mission

Build the smallest agentic CRM core required to run and measure the JKDD Finish & Remodeling pilot without replacing JKDD Leads or importing a second CRM.

Canonical rule:

```
ONE LEAD -> ONE CANONICAL RECORD -> MULTIPLE PRODUCT VIEWS
```

JKDD Leads owns lead truth. JKDD Continuous owns orchestration. External research/enrichment can only create candidate evidence until the JKDD Leads domain accepts it.

## 2. P0 flow

```
Lead Intake
   |
   v
Normalize + Fingerprint
   |
   +---- duplicate ----> existing canonical lead + audit event
   |
   v
Evidence Ledger
   |
   v
Deterministic Qualification
   |
   v
Due Work Queue
   |
   v
Concierge Action Boundary
   |
   v
Reasoned Follow-up / Recheck
   |
   v
Append-only Audit Trail
```

## 3. Upstream adoption matrix

| Comp AI CRM pattern | P0 decision | JKDD implementation |
| --- | --- | --- |
| Durable work queue | ADAPT | Provider-neutral task model with `dueAt`, priority, lease owner/expiry, attempts and status |
| `FOR UPDATE SKIP LOCKED` claim pattern | ADAPT LATER | P0 browser/local engine models lease semantics; server DB implementation must use an atomic claim strategy |
| Evidence-first facts | ADAPT | JKDD Evidence Ledger with source, source reference, observation time and evidence status |
| `schedule_recheck` | ADAPT | Follow-up/recheck task requires both date and explicit reason |
| Agent transcript / observability | ADAPT | Append-only audit events for intake, dedupe, evidence, qualification, queue and completion |
| Full Eve agent runtime | DEFER | JKDD Continuous remains the orchestrator |
| Better Auth | REJECT FOR P0 | Existing JKDD auth governance remains unchanged |
| Full upstream Postgres schema | REJECT | No second lead Source of Truth |
| Vercel deployment stack | REJECT | Not required; zero-cost Dev/Test remains preferred |
| Paid enrichment vendors | DEFER | No paid dependency in P0 |
| Autonomous outbound outreach | REJECT FOR P0 | Human-reviewed Concierge boundary only |

## 4. P0 domain contracts

### Lead

Required:
- `id`
- `fingerprint`
- `name`
- `source`
- `createdAt`
- `updatedAt`

Optional:
- phone
- email
- service
- location
- urgency
- budget

### LeadEvidence

- `id`
- `leadId`
- `field`
- `value`
- `sourceType`
- `sourceRef`
- `strength`: `candidate | corroborated | accepted | rejected`
- `observedAt`
- `recordedAt`

No model-supplied confidence percentage is accepted as canonical evidence.

### Qualification

- deterministic `score`
- `band`: HOT / WARM / NURTURE / LOW
- explicit `reasons[]`
- timestamp

### WorkTask

- `id`
- `leadId`
- `kind`
- `reason`
- `priority`
- `dueAt`
- `status`: pending / leased / completed / failed
- `leaseOwner`
- `leaseUntil`
- `attempts`
- timestamps

### AuditEvent

Append-only event:
- `id`
- `type`
- `entityType`
- `entityId`
- `payload`
- `occurredAt`

## 5. Deterministic deduplication order

1. normalized email, when present;
2. normalized phone, when present;
3. fallback composite of normalized name + location.

A duplicate must return the existing canonical lead and create an audit event. It must not create a second lead record.

## 6. Qualification policy for the P0 pilot

The current P0 score is deterministic and deliberately simple:

- service present: +30
- location present: +15
- urgency now: +20
- urgency within 30 days: +12
- later/other urgency: +5
- clear budget: +15
- phone present: +10
- email present: +5
- at least one accepted/corroborated evidence item: +5

Bands:
- HOT >= 80
- WARM >= 60
- NURTURE >= 35
- LOW < 35

This is a pilot heuristic, not a machine-learning claim.

## 7. Queue semantics

The P0 queue implements the same safety objective as a database leasing queue:

- only due tasks can be claimed;
- a worker receives a lease for a bounded duration;
- another worker cannot claim an active lease;
- an expired lease can be reclaimed;
- completion requires the current lease owner;
- every transition is audited.

When the queue moves to a transactional server database, the claim operation must be atomic. PostgreSQL `FOR UPDATE SKIP LOCKED` is an approved reference pattern, not a requirement to copy upstream code.

## 8. Follow-up rule

A recheck/follow-up cannot be scheduled without:
- a future/due timestamp; and
- a human-readable reason.

This prevents unexplained "check again later" automation.

## 9. Security / compliance boundaries

P0 does not:
- send autonomous unsolicited messages;
- call or text customers;
- scrape authenticated/private sources;
- store secrets in source control;
- write to Production;
- use paid providers;
- treat scraped/enriched values as canonical without acceptance.

## 10. Acceptance test

Run:

```bash
node p0/self-test.cjs
```

PASS requires:
1. a lead is ingested;
2. the same phone in a different format is deduplicated;
3. evidence is recorded;
4. qualification is deterministic and includes reasons;
5. a recheck requires a reason;
6. one worker claims the due task;
7. a second worker cannot claim the active lease;
8. the lease owner can complete the task;
9. the audit trail contains the lifecycle evidence.

## Implementation status — 2026-09-24

The first P0 engine and the Development/Test UI wiring have been merged to §main§:

- **Implemented:** lead normalization/fingerprinting, duplicate detection, evidence records, deterministic qualification, due-work queue and lease semantics, reason-required rechecks, append-only audit events, and a browser adapter.
- **Automated checks passed:** §p0/self-test.cjs§ and §p0/browser-adapter-self-test.cjs§ ran successfully in the PR #10 CI workflow. The corresponding GitHub Pages deployment of main SHA §bccd0f5§ also succeeded.
- **Runtime boundary:** the main UI uses browser-local state via §localStorage§. The P0 lab creates in-memory state. Neither is shared server persistence.
- **Still pending:** connect and validate the approved lead source; capture pilot outcome metrics; connect CONTÍNUO runtime agents; implement governed server-side identity, storage and atomic shared queue claiming before multi-user/production use; perform real-browser desktop/mobile and safe end-to-end pilot validation.
- **Environment:** Development/Test only. Production remains untouched.

Evidence: [P0 issue #8](https://github.com/joukinneto/jkdd-leads/issues/8), [UI wiring PR #10](https://github.com/joukinneto/jkdd-leads/pull/10), [CI run 36035063384](https://github.com/joukinneto/jkdd-leads/actions/runs/36035063384), and [Pages deployment run 36035106783](https://github.com/joukinneto/jkdd-leads/actions/runs/36035106783).

## 11. Next implementation after this contract

The first implementation steps in the original contract are complete in the current source: the P0 core has self-tests, and PR #10 wires the existing UI through the browser adapter. The remaining ordered work is:

1. **Complete the first pilot evidence loop** tracked by [issue #7](https://github.com/joukinneto/jkdd-leads/issues/7): use a safely staged flow, then record intake, contact, appointment, estimate, won-job, revenue and time-to-first-contact evidence.
2. **Connect the approved lead-intake source** used by JKDD Finish in Development/Test and prove one end-to-end record with provenance and duplicate handling.
3. **Persist pilot metrics** so results survive browser/device changes and can be audited.
4. **Connect CONTÍNUO runtime agents** under the existing human-review and cost boundaries.
5. **Design governed server-side identity, storage and atomic queue claiming** before any multi-user or Production use.
6. Keep expansion, paid enrichment and new outreach channels deferred until the pilot evidence identifies a concrete need.


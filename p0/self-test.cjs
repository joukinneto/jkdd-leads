"use strict";

const assert = require("node:assert/strict");
const P0 = require("./agentic-core.js");

const state = P0.createState();
const T0 = "2026-09-24T16:00:00.000Z";

const first = P0.ingestLead(state, {
  name: "Pilot Customer",
  phone: "(561) 555-0100",
  email: "pilot@example.com",
  service: "Finish Carpentry",
  location: "Boca Raton, FL",
  urgency: "now",
  budget: "clear"
}, { source: "jkdd-finish-site", now: T0 });

assert.equal(first.duplicate, false);
assert.equal(state.leads.length, 1);

const duplicate = P0.ingestLead(state, {
  name: "Pilot Customer Duplicate",
  email: "PILOT@EXAMPLE.COM",
  phone: "561-555-0100"
}, { source: "manual-test", now: "2026-09-24T16:01:00.000Z" });

assert.equal(duplicate.duplicate, true);
assert.equal(duplicate.lead.id, first.lead.id);
assert.equal(state.leads.length, 1);

const evidence = P0.recordEvidence(state, {
  leadId: first.lead.id,
  field: "service",
  value: "Finish Carpentry",
  sourceType: "form.submission",
  sourceRef: "JKDD Finish contact form",
  strength: "accepted",
  observedAt: T0
}, { now: "2026-09-24T16:02:00.000Z" });

assert.equal(evidence.leadId, first.lead.id);
assert.equal(state.evidence.length, 1);

const qualification = P0.qualifyLead(
  state,
  first.lead.id,
  { now: "2026-09-24T16:03:00.000Z" }
);

assert.equal(qualification.score, 100);
assert.equal(qualification.band, "HOT");
assert.ok(qualification.reasons.length >= 6);

assert.throws(() => {
  P0.scheduleRecheck(state, {
    leadId: first.lead.id,
    dueAt: "2026-09-24T16:04:00.000Z"
  }, { now: "2026-09-24T16:03:00.000Z" });
}, /explicit reason/);

const task = P0.scheduleRecheck(state, {
  leadId: first.lead.id,
  dueAt: "2026-09-24T16:04:00.000Z",
  reason: "Customer requested a callback after reviewing project photos."
}, { now: "2026-09-24T16:03:00.000Z" });

assert.equal(task.status, "pending");

const workerA = P0.claimDueTasks(state, {
  workerId: "JL-FOLLOWUP-A",
  now: "2026-09-24T16:05:00.000Z",
  leaseMs: 300000
});

assert.equal(workerA.length, 1);
assert.equal(workerA[0].id, task.id);

const workerB = P0.claimDueTasks(state, {
  workerId: "JL-FOLLOWUP-B",
  now: "2026-09-24T16:05:10.000Z",
  leaseMs: 300000
});

assert.equal(workerB.length, 0);

const completed = P0.completeTask(state, {
  taskId: task.id,
  workerId: "JL-FOLLOWUP-A",
  result: { outcome: "pilot-test-complete" },
  now: "2026-09-24T16:06:00.000Z"
});

assert.equal(completed.status, "completed");

P0.recordConciergeAction(state, {
  leadId: first.lead.id,
  channel: "email",
  action: "drafted_follow_up",
  outcome: "human_review_required",
  reviewedByHuman: true,
  now: "2026-09-24T16:07:00.000Z"
});

assert.ok(state.audit.some((e) => e.type === "lead.duplicate_detected"));
assert.ok(state.audit.some((e) => e.type === "evidence.recorded"));
assert.ok(state.audit.some((e) => e.type === "lead.qualified"));
assert.ok(state.audit.some((e) => e.type === "task.leased"));
assert.ok(state.audit.some((e) => e.type === "task.completed"));
assert.ok(state.audit.some((e) => e.type === "concierge.action_recorded"));

console.log("JKDD LEADS P0 SELF-TEST: PASS");
console.log(JSON.stringify({
  version: P0.VERSION,
  leads: state.leads.length,
  evidence: state.evidence.length,
  tasks: state.tasks.length,
  auditEvents: state.audit.length,
  qualification
}, null, 2));

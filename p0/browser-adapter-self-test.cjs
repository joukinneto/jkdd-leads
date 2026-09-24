"use strict";

const assert = require("node:assert/strict");
global.JKDDLeadsP0 = require("./agentic-core.js");
const Browser = require("./browser-adapter.js");

const storage = Browser.memoryStorage();
const adapter = Browser.createBrowserAdapter({ storage });

const at = "2026-09-24T18:00:00.000Z";
const result = adapter.ingestAndQualify({
  name: "P0 UI Pilot",
  phone: "(561) 555-0123",
  email: "p0-ui@example.com",
  service: "Finish Carpentry",
  location: "Boca Raton, FL",
  urgency: "now",
  budget: "clear"
}, {
  source: "jkdd-finish-site-staged",
  now: at
});

assert.equal(result.duplicate, false);
assert.equal(result.qualification.score, 100);
assert.equal(result.qualification.band, "HOT");
assert.ok(result.task);
assert.equal(result.task.kind, "FOLLOW_UP");
assert.match(result.task.reason, /human-reviewed/i);

const duplicate = adapter.ingestAndQualify({
  name: "Same Pilot",
  email: "P0-UI@EXAMPLE.COM"
}, {
  source: "duplicate-staged",
  now: "2026-09-24T18:01:00.000Z"
});

assert.equal(duplicate.duplicate, true);
assert.equal(adapter.metrics().canonicalLeads, 1);

const claimedA = adapter.claimDue("JL-CONCIERGE-A", {
  now: "2026-09-24T18:02:00.000Z",
  leaseMs: 300000
});
assert.equal(claimedA.length, 1);

const claimedB = adapter.claimDue("JL-CONCIERGE-B", {
  now: "2026-09-24T18:02:10.000Z",
  leaseMs: 300000
});
assert.equal(claimedB.length, 0);

adapter.complete(claimedA[0].id, "JL-CONCIERGE-A", {
  outcome: "human-review-complete"
}, {
  now: "2026-09-24T18:03:00.000Z"
});

const metrics = adapter.metrics();
assert.equal(metrics.canonicalLeads, 1);
assert.ok(metrics.evidenceItems >= 7);
assert.equal(metrics.completedTasks, 1);
assert.ok(metrics.auditEvents > 0);

const reloaded = Browser.createBrowserAdapter({ storage });
assert.equal(reloaded.metrics().canonicalLeads, 1);
assert.equal(reloaded.metrics().completedTasks, 1);

console.log("JKDD LEADS P0 BROWSER ADAPTER SELF-TEST: PASS");
console.log(JSON.stringify(reloaded.metrics(), null, 2));

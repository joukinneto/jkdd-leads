(function (root) {
  "use strict";

  const Core = root.JKDDLeadsP0 || (typeof require !== "undefined" ? require("./agentic-core.js") : null);
  if (!Core) throw new Error("JKDDLeadsP0 core is required");

  const DEFAULT_KEY = "jkdd-leads.agentic-p0.state.v1";

  function memoryStorage() {
    const values = new Map();
    return {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); }
    };
  }

  function createBrowserAdapter(options) {
    options = options || {};
    const storage = options.storage || (typeof localStorage !== "undefined" ? localStorage : memoryStorage());
    const storageKey = options.storageKey || DEFAULT_KEY;

    function load() {
      try {
        const raw = storage.getItem(storageKey);
        if (!raw) return Core.createState();
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.leads) || !Array.isArray(parsed.evidence) || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.audit)) {
          return Core.createState();
        }
        return parsed;
      } catch {
        return Core.createState();
      }
    }

    let state = load();

    function save() {
      storage.setItem(storageKey, JSON.stringify(state));
      return state;
    }

    function now() {
      return new Date().toISOString();
    }

    function recordFormEvidence(leadId, input, at) {
      const fields = [
        ["name", input.name],
        ["phone", input.phone],
        ["email", input.email],
        ["service", input.service],
        ["location", input.location],
        ["urgency", input.urgency],
        ["budget", input.budget]
      ];

      for (const [field, value] of fields) {
        if (String(value == null ? "" : value).trim()) {
          Core.recordEvidence(state, {
            leadId,
            field,
            value,
            sourceType: "form.submission",
            sourceRef: "JKDD Leads Development/Test UI",
            strength: "accepted",
            observedAt: at
          }, { now: at });
        }
      }
    }

    function ingestAndQualify(input, options) {
      options = options || {};
      const at = options.now || now();
      const result = Core.ingestLead(state, input, {
        source: options.source || input.source || "jkdd-leads-ui",
        now: at
      });

      if (!result.duplicate) {
        recordFormEvidence(result.lead.id, input, at);
      }

      const qualification = Core.qualifyLead(state, result.lead.id, { now: at });

      let task = null;
      const shouldQueue = !result.duplicate && qualification.score >= 60 && options.enqueueFirstContact !== false;
      if (shouldQueue) {
        task = Core.enqueueTask(state, {
          leadId: result.lead.id,
          kind: "FOLLOW_UP",
          reason: options.followUpReason || "New qualified lead requires human-reviewed first contact.",
          dueAt: options.dueAt || at,
          priority: qualification.band === "HOT" ? 90 : 70,
          payload: { source: options.source || "jkdd-leads-ui" }
        }, { now: at });
      }

      save();
      return {
        canonicalLead: result.lead,
        duplicate: result.duplicate,
        qualification,
        task
      };
    }

    function scheduleRecheck(input, options) {
      const at = (options && options.now) || now();
      const task = Core.scheduleRecheck(state, input, { now: at });
      save();
      return task;
    }

    function claimDue(workerId, options) {
      const claimed = Core.claimDueTasks(state, {
        workerId,
        now: (options && options.now) || now(),
        limit: options && options.limit,
        leaseMs: options && options.leaseMs
      });
      save();
      return claimed;
    }

    function complete(taskId, workerId, result, options) {
      const task = Core.completeTask(state, {
        taskId,
        workerId,
        result: result || {},
        now: (options && options.now) || now()
      });
      save();
      return task;
    }

    function recordConciergeAction(input) {
      const action = Core.recordConciergeAction(state, input);
      save();
      return action;
    }

    function metrics() {
      return {
        canonicalLeads: state.leads.length,
        evidenceItems: state.evidence.length,
        pendingTasks: state.tasks.filter((task) => task.status === "pending").length,
        leasedTasks: state.tasks.filter((task) => task.status === "leased").length,
        completedTasks: state.tasks.filter((task) => task.status === "completed").length,
        auditEvents: state.audit.length
      };
    }

    function reset() {
      state = Core.createState();
      save();
      return state;
    }

    return {
      VERSION: "0.1.0",
      storageKey,
      get state() { return state; },
      save,
      ingestAndQualify,
      scheduleRecheck,
      claimDue,
      complete,
      recordConciergeAction,
      metrics,
      reset
    };
  }

  const api = { DEFAULT_KEY, createBrowserAdapter, memoryStorage };
  root.JKDDLeadsP0Browser = api;

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    document.addEventListener("click", function (event) {
      const button = event.target && event.target.closest ? event.target.closest("[data-act=new]") : null;
      if (!button) return;
      event.preventDefault();
      window.location.href = "./new-lead.html";
    }, true);
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

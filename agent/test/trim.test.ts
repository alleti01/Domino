import { describe, expect, it } from "vitest";
import type { ExperimentResult } from "../../contracts/agent/types.js";
import { trimFix } from "../src/fix.js";

type Overrides = Record<string, string | number | boolean>;
let n = 0;
const result = (variant: "candidate" | "baseline", p99: number, ok: boolean, overrides: Overrides = {}): ExperimentResult => ({
  experiment_id: `x${++n}`,
  request: { world_id: "w", change_id: "w/change/1", variant, observe: [], params: { overrides } },
  completed: true,
  observations: { "gateway.p99_latency_ms": p99, "gateway.failed": ok ? 0 : 2838 },
  assertions: [{ name: "gateway_success_rate", passed: ok, detail: ok ? "observed 1.0" : "observed 0.165" }],
  logs_tail: "",
  artifacts: [],
  duration_ms: 0,
});
const baseline = result("baseline", 60, true);
const failing = result("candidate", 240, false);

/** A fake world: `fixes` decides whether a set of overrides repairs the candidate, `p99` what latency it shows. */
const world = (fixes: (o: Overrides) => boolean, p99: (o: Overrides) => number) => {
  const calls: Overrides[] = [];
  const run = async (variant: "candidate" | "baseline", o: Overrides) => {
    calls.push(o);
    return variant === "baseline" ? result("baseline", 60, true, o) : result("candidate", p99(o), fixes(o), o);
  };
  return { run, calls };
};
const common = { failing, baseline, chainText: "the order service takes longer per request, p99 latency 60 → 240, past the gateway timeout" };

describe("P4: keep only the overrides a fix needs", () => {
  it("drops overrides the candidate passes without, and says the kept one only adds headroom", async () => {
    // Like w-c5h2: timeout + retries + workers were proposed; more workers alone is what fixes it.
    const w = world((o) => "workers" in o, (o) => ("workers" in o ? 100 : 240));
    const t = (await trimFix({ ...common, overrides: { timeout_ms: 300, max_retries: 5, workers: 16 }, run: w.run }))!;
    expect(t.kept).toEqual({ workers: 16 });
    expect(t.trim.not_needed.sort()).toEqual(["max_retries", "timeout_ms"]);
    expect(t.trim.alternatives).toEqual([]);
    expect(t.trim.kinds.workers).toBe("adds_headroom"); // p99 stays at 100, not back to 60
    expect(t.verified?.status).toBe("verified");
    expect(t.trim.experiments.length).toBe(t.runs.length);
  });

  it("when several fix it alone, keeps the one that removes the cause and lists the others as alternatives", async () => {
    const w = world((o) => "remove_call" in o || "timeout_ms" in o, (o) => ("remove_call" in o ? 60 : 240));
    const t = (await trimFix({ ...common, overrides: { timeout_ms: 400, remove_call: true }, run: w.run }))!;
    expect(t.kept).toEqual({ remove_call: true });
    expect(t.trim.kinds).toEqual({ remove_call: "removes_cause", timeout_ms: "adds_headroom" });
    expect(t.trim.alternatives).toEqual(["timeout_ms"]);
  });

  it("keeps every override when each one is needed", async () => {
    const w = world((o) => "knob_one" in o && "knob_two" in o, () => 240);
    const t = (await trimFix({ ...common, overrides: { knob_one: 1, knob_two: 2 }, run: w.run }))!;
    expect(t.kept).toEqual({ knob_one: 1, knob_two: 2 });
    expect(t.trim.not_needed).toEqual([]);
    expect(t.verified).toBeNull(); // nothing dropped, nothing to re-verify
  });

  it("keeps the full fix when the smaller set does not hold on re-verification", async () => {
    let aloneRuns = 0;
    const w = world(
      // knob_one alone passes the first time only (flaky); both together always pass; knob_two alone never does.
      (o) => ("knob_one" in o && "knob_two" in o) || ("knob_one" in o && !("knob_two" in o) && ++aloneRuns === 1),
      () => 240,
    );
    const t = (await trimFix({ ...common, overrides: { knob_one: 1, knob_two: 2 }, run: w.run }))!;
    expect(t.verified?.status).toBe("failed");
    expect(t.kept).toEqual({ knob_one: 1, knob_two: 2 });
    expect(t.trim.not_needed).toEqual([]);
  });

  it("gives up without changing the fix when the data layer is unavailable", async () => {
    const t = await trimFix({ ...common, overrides: { knob_one: 1, knob_two: 2 }, run: async () => null });
    expect(t).toBeNull();
  });

  it("costs no extra runs for a single override, and still says what kind of fix it is", async () => {
    const w = world(() => true, () => 100);
    const t = (await trimFix({ ...common, overrides: { workers: 12 }, run: w.run, fullCandidate: result("candidate", 100, true, { workers: 12 }) }))!;
    expect(w.calls).toEqual([]);
    expect(t.trim.kinds.workers).toBe("adds_headroom");
  });
});

describe("P4 in the PR report", () => {
  it("says which settings were kept, which were not needed, and what each kept one does to the measured effects", async () => {
    const { renderReport } = await import("../src/bundle.js");
    const fv = {
      status: "verified" as const, overrides: { workers: 16 }, experiments: [], reasons: ["With the fix applied, the candidate passed 2× and the baseline still passed 1×."], rounds: 1,
      trim: { proposed: { timeout_ms: 300, max_retries: 5, workers: 16 }, not_needed: ["timeout_ms", "max_retries"], alternatives: [], kinds: { workers: "adds_headroom" as const, timeout_ms: "adds_headroom" as const, max_retries: "adds_headroom" as const }, experiments: [] },
    };
    const report = renderReport({
      bundle_version: "1", run_id: "r", replay: false, mode: "full",
      change: { change_id: "w/change/1", world_id: "w", title: "t", files: [], diff: "", source: null },
      verdict: { verdict: "reproduced_failure", headline: "h", cause: null, decided_by: "deterministic_judge", tested: [], limitations: [], mitigation: { text: "add workers", verified: true }, fix_verification: fv },
      causal_chain: [], cause_chain: [], cause_chain_check: "absent", experiments: [], hypotheses: [], cited_evidence: [],
      models: { calls: 0, failed: 0, all_nemotron: true, by_model: {}, request_ids: [], total_latency_ms: 0, provider: "Meterless Nightshift" },
      world_model: { writes: 0, reads: 0, updates: 0 }, review: { reviewer_model: null, rounds: 0, final: "not_run", issues: [] }, queries: 0, duration_ms: 0,
    });
    expect(report).toContain("Domino tried each setting: only `workers=16` (adds headroom: the checks pass while the failure's effects stay) is needed.");
    expect(report).toContain("Not needed: `timeout_ms=300`, `max_retries=5` (the candidate passes without them).");
  });
});

describe("P4 follow-up: kinds are judged on metrics an override can move", () => {
  // Like a rule change: the new rule is always checked (rules_checked 3 → 4 whatever the fix), and the
  // interpreter crashes (exit 3) unless it is given enough inputs or the validator rejects the rule.
  const obs = (rules: number, exit: number, rejected: number) => ({ "validator.rules_checked": rules, "interpreter.exit_code": exit, "validator.rules_rejected": rejected });
  const res = (variant: "candidate" | "baseline", o: Record<string, number>, ok: boolean): ExperimentResult => ({
    experiment_id: `y${++n}`, request: { world_id: "w", change_id: "w/change/1", variant, observe: [] }, completed: true,
    observations: o, assertions: [{ name: "interpreter_keeps_running", passed: ok, detail: "" }], logs_tail: "", artifacts: [], duration_ms: 0,
  });
  const base = res("baseline", obs(3, 0, 0), true);
  const fail = res("candidate", obs(4, 3, 0), false);
  const run = async (variant: "candidate" | "baseline", o: Overrides) => {
    if (variant === "baseline") return res("baseline", obs(3, 0, 0), true);
    if ("inputs_supplied" in o) return res("candidate", obs(4, 0, 0), true); // fixes the interpreter: exit back to 0
    if ("checks_inputs" in o) return res("candidate", obs(4, 0, 1), true); // validator rejects the rule instead
    return res("candidate", obs(4, 3, 0), false);
  };

  it("leaves out the change's own effect, so a fix that undoes the failure downstream removes the cause", async () => {
    const chainText = "the rule reads 21 fields but the interpreter has 20 inputs supplied, so it exits 3";
    const t = (await trimFix({ failing: fail, baseline: base, chainText, overrides: { inputs_supplied: 21, checks_inputs: true }, run }))!;
    // rules_checked stays 4 in every single-override run: the change's own effect, not judged. Both overrides bring
    // the interpreter's exit back to 0, so both remove the cause; the one the chain names is kept.
    expect(t.trim.kinds).toEqual({ inputs_supplied: "removes_cause", checks_inputs: "removes_cause" });
    expect(t.kept).toEqual({ inputs_supplied: 21 });
    expect(t.trim.alternatives).toEqual(["checks_inputs"]);
  });

  it("still tells a fix that only adds headroom apart when the latency it absorbs stays moved", async () => {
    // Order service: the change adds latency (p99 60 → 240). More workers pass the checks at p99 100; removing the call brings p99 to 60.
    const w = world((o) => "workers" in o || "remove_call" in o, (o) => ("remove_call" in o ? 60 : "workers" in o ? 100 : 240));
    const t = (await trimFix({ ...common, overrides: { workers: 16, remove_call: true }, run: w.run }))!;
    expect(t.trim.kinds).toEqual({ workers: "adds_headroom", remove_call: "removes_cause" });
    expect(t.kept).toEqual({ remove_call: true });
  });

  it("is undetermined when no override moves anything the change moved", async () => {
    const t = (await trimFix({ failing: fail, baseline: base, chainText: "", overrides: { knob_one: 1, knob_two: 2 }, run }))!;
    expect(t.trim.kinds).toEqual({ knob_one: "undetermined", knob_two: "undetermined" });
  });
});

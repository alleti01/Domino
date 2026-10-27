import { describe, expect, it } from "vitest";
import type { ExperimentResult } from "../../contracts/agent/types.js";
import { searchForCause } from "../src/fix.js";

type Overrides = Record<string, string | number | boolean>;
let n = 0;
const res = (variant: "candidate" | "baseline", entries: number, exit: number, overrides: Overrides = {}): ExperimentResult => ({
  experiment_id: `s${++n}`,
  request: { world_id: "w", change_id: "w/change/42", variant, observe: [], params: { overrides } },
  completed: true,
  // Like the real bundle worlds: the runtime also reports how many entries it loaded (0 when it refuses to start).
  observations: { "builder.entries": entries, "runtime.exit_code": exit, "runtime.loaded_entries": exit === 0 ? entries : 0 },
  assertions: [{ name: "runtime_starts", passed: exit === 0, detail: "" }],
  logs_tail: "",
  artifacts: [],
  duration_ms: 0,
});

// A bundle world: the change doubles the bundle (140 → 280) past the runtime's 200 limit.
// Raising the limit passes with the bundle still doubled; collapsing duplicates brings it back to 140.
const world = () => {
  const calls: Array<{ variant: string; o: Overrides }> = [];
  const run = async (variant: "candidate" | "baseline", o: Overrides) => {
    calls.push({ variant, o });
    if (variant === "baseline") return res("baseline", 140, 0, o);
    if (o["builder.output_mode"] === "collapse_same_name") return res("candidate", 140, 0, o);
    if (Number(o["runtime.max_entries"] ?? 200) >= 280) return res("candidate", 280, 0, o);
    return res("candidate", 280, 2, o);
  };
  return { run, calls };
};
const baseline = res("baseline", 140, 0);
const failing = res("candidate", 280, 2);
const current = { "runtime.max_entries": 300 };
const currentRun = res("candidate", 280, 0, current);
const targets = (choices: boolean) => [
  { target: "runtime.max_entries", current: 200, type: "number" as const },
  { target: "builder.output_mode", current: "as_returned", type: "string" as const, ...(choices ? { choices: ["as_returned", "collapse_same_name"] } : {}) },
];

describe("P5: look for a fix that removes the cause", () => {
  it("code tries each fixed choice and swaps in one that removes the cause, keeping the headroom fix as an alternative", async () => {
    const w = world();
    let asked = 0;
    const r = (await searchForCause({ targets: targets(true), current, currentRun, failing, baseline, run: w.run, ask: async () => (asked++, []) }))!;
    expect(r.search.tried[0]).toMatchObject({ overrides: { "builder.output_mode": "collapse_same_name" }, by: "code", passed: true, kind: "removes_cause" });
    expect(r.search.found).toBe(true);
    expect(r.fix).toEqual({ overrides: { "builder.output_mode": "collapse_same_name" }, mitigation: null });
    expect(r.search.replaced).toEqual(current);
    expect(asked).toBe(1); // the investigator is still asked once
    // re-verified the usual way: candidate twice and baseline once with the new fix
    expect(w.calls.filter((c) => c.o["builder.output_mode"] === "collapse_same_name").map((c) => c.variant)).toEqual(["candidate", "candidate", "candidate", "baseline"]);
  });

  it("without listed choices, uses the investigator's one proposal, and keeps its words as the fix", async () => {
    const w = world();
    const r = (await searchForCause({
      targets: targets(false), current, currentRun, failing, baseline, run: w.run,
      ask: async (stillMoved) => {
        expect(stillMoved).toEqual(["builder.entries", "runtime.loaded_entries"]); // what the headroom fix leaves moved
        return [{ overrides: { "builder.output_mode": "collapse_same_name" }, mitigation: "Collapse same-name fields so the bundle is not doubled." }];
      },
    }))!;
    expect(r.search.tried.map((t) => t.by)).toEqual(["investigator"]);
    expect(r.fix?.mitigation).toBe("Collapse same-name fields so the bundle is not doubled.");
  });

  it("adopts the smallest fix that removes the cause when the investigator offers several (seen live)", async () => {
    const w = world();
    const r = (await searchForCause({
      targets: targets(false), current, currentRun, failing, baseline, run: w.run,
      ask: async (): Promise<Array<{ overrides: Overrides; mitigation: string }>> => [
        { overrides: { "runtime.max_entries": 280, "builder.output_mode": "collapse_same_name" }, mitigation: "raise the limit and collapse" },
        { overrides: { "builder.output_mode": "collapse_same_name" }, mitigation: "collapse same-name fields" },
      ],
    }))!;
    expect(r.search.tried.map((t) => t.kind)).toEqual(["removes_cause", "removes_cause"]);
    expect(r.fix).toEqual({ overrides: { "builder.output_mode": "collapse_same_name" }, mitigation: "collapse same-name fields" });
  });

  it("says plainly when no setting removes the cause, and keeps the headroom fix", async () => {
    const w = world();
    const r = (await searchForCause({ targets: [targets(false)[0]!], current, currentRun, failing, baseline, run: w.run, ask: async () => [{ overrides: { "runtime.max_entries": 400 }, mitigation: "raise it more" }, { overrides: { "runtime.max_entries": 300 }, mitigation: "the same fix again" }] }))!;
    expect(r.search.found).toBe(false);
    expect(r.fix).toBeNull();
    expect(r.search.tried[0]).toMatchObject({ passed: true, kind: "adds_headroom" });
    expect(r.search.tried).toHaveLength(1); // the repeat of the current fix is not run again
    expect(r.search.note).toContain("No fix that removes the cause was found among the overridable settings (1 tried)");
  });

  it("tries the other value of an on/off setting", async () => {
    const calls: Overrides[] = [];
    const run = async (variant: "candidate" | "baseline", o: Overrides) => (calls.push(o), variant === "baseline" ? res("baseline", 140, 0, o) : o.validate ? res("candidate", 140, 0, o) : res("candidate", 280, 2, o));
    const r = (await searchForCause({ targets: [{ target: "validate", current: false, type: "boolean" }], current, currentRun, failing, baseline, run, ask: async () => [] }))!;
    expect(calls[0]).toEqual({ validate: true });
    expect(r.search.found).toBe(true);
  });

  it("gives up without changing the fix when the data layer is unavailable", async () => {
    expect(await searchForCause({ targets: targets(true), current, currentRun, failing, baseline, run: async () => null, ask: async () => [] })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { ExperimentResult } from "../../contracts/agent/types.js";
import { confirmationsNeeded, judge } from "../src/judge.js";

let n = 0;
const run = (variant: "baseline" | "candidate" | "control", pass: boolean, params?: Record<string, number>): ExperimentResult => ({
  experiment_id: `x${++n}`,
  request: { world_id: "w", change_id: "c", variant, observe: [], ...(params ? { params } : {}) },
  completed: true,
  observations: {},
  assertions: [{ name: "consumer.loads", passed: pass, detail: "" }],
  logs_tail: "",
  artifacts: [],
  duration_ms: 1,
});

describe("judge", () => {
  it("is inconclusive with no experiments", () => {
    expect(judge([]).verdict).toBe("inconclusive");
  });

  it("reproduces only with baseline pass, repeated candidate fail and a passing control", () => {
    expect(judge([run("baseline", true), run("candidate", false), run("candidate", false), run("control", true)]).verdict).toBe("reproduced_failure");
  });

  it("does not reproduce a single candidate failure", () => {
    expect(judge([run("baseline", true), run("candidate", false), run("control", true)]).verdict).toBe("inconclusive");
  });

  it("does not reproduce without a control run", () => {
    expect(judge([run("baseline", true), run("candidate", false), run("candidate", false)]).verdict).toBe("inconclusive");
  });

  it("does not blame the change when baseline already fails", () => {
    expect(judge([run("baseline", false), run("candidate", false), run("candidate", false), run("control", false)]).verdict).toBe("inconclusive");
  });

  it("reports no failure observed when baseline and candidate both pass", () => {
    expect(judge([run("baseline", true), run("candidate", true)]).verdict).toBe("no_failure_observed");
  });

  it("only compares runs under the same params", () => {
    expect(judge([run("baseline", true, { n: 1 }), run("candidate", false, { n: 2 }), run("candidate", false, { n: 2 }), run("control", true, { n: 2 })]).verdict).toBe("inconclusive");
  });

  it("asks the harness for a repeat and a control after a candidate failure", () => {
    const needs = confirmationsNeeded([run("baseline", true), run("candidate", false)]).map((x) => x.variant);
    expect(needs.sort()).toEqual(["candidate", "control"]);
  });
});

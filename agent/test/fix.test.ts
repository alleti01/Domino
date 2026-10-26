import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type ChatModel, investigate } from "../src/agent.js";
import { buildBundle } from "../src/bundle.js";
import { StubEvidence, StubWorlds } from "../src/fakes/stubWorld.js";
import { parseOverrides } from "../src/fix.js";
import { judgeFix } from "../src/judge.js";
import type { ChatResult } from "../src/llm/nightshift.js";
import { readFile } from "node:fs/promises";

const NEMOTRON = "nvidia/nemotron-3.5-lightning-30b-a3b";
const TARGETS = [
  { target: "loader.max_items", current: 50, type: "number" as const },
  { target: "builder.schema_filter", current: "none", type: "string" as const },
];

const scripted = (steps: Array<Array<{ name: string; args: unknown }>>): ChatModel => ({
  async chat(): Promise<ChatResult> {
    const step = steps.shift() ?? [];
    return {
      message: { role: "assistant", content: null, tool_calls: step.map((c, i) => ({ id: `c${i}`, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })) },
      finishReason: "tool_calls",
      receipt: { schema: null, receiptId: null, requestId: "r", routedModel: NEMOTRON, providerModel: NEMOTRON, reason: null, phaseModels: [NEMOTRON], cacheStatus: "miss", requestedModel: NEMOTRON, latencyMs: 1, attempts: 1, at: "", raw: {} },
      attempts: 1,
      latencyMs: 1,
    };
  },
});
const investigation = [
  [{ name: "run_experiment", args: { variant: "candidate", observe: ["artifact_entries", "consumer_status"], hypothesis_ids: [], rationale: "test" } }],
  [{ name: "finish", args: { headline: "Loader rejects items.list", prediction: "breaks", cause_claim: "60 entries exceed max_items 50", mitigation: "raise the loader limit", evidence: ["x2"], supported_hypothesis_ids: [], limitations: [] } }],
];
const run = async (steps: Array<Array<{ name: string; args: unknown }>>) => {
  const out = await mkdtemp(join(tmpdir(), "domino-fix-"));
  const summary = await investigate({ changeId: "stub-chg-1", mode: "full", outDir: out, model: scripted([...investigation, ...steps]), evidence: new StubEvidence(), worlds: new StubWorlds() });
  const events = (await readFile(join(out, summary.run_id, "trace.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
  return { summary, bundle: buildBundle(events) };
};
const fix = (target: string, value: string, mitigation = "raise the loader limit") => [{ name: "propose_fix", args: { overrides: [{ target, value }], mitigation } }];

describe("verified fixes", () => {
  it("parses overrides by the declared type and rejects unknown, untyped or no-op ones", () => {
    expect(parseOverrides([{ target: "loader.max_items", value: "120" }], TARGETS)).toEqual({ overrides: { "loader.max_items": 120 } });
    expect(parseOverrides({ "builder.schema_filter": "main" }, TARGETS)).toEqual({ overrides: { "builder.schema_filter": "main" } });
    expect(parseOverrides([{ target: "loader.timeout", value: "5" }], TARGETS)).toHaveProperty("error");
    expect(parseOverrides([{ target: "loader.max_items", value: "lots" }], TARGETS)).toHaveProperty("error");
    expect(parseOverrides([{ target: "loader.max_items", value: "50" }], TARGETS)).toHaveProperty("error");
    expect(parseOverrides([], TARGETS)).toHaveProperty("error");
  });

  it("judgeFix needs the candidate to pass every time and the baseline to keep passing", () => {
    const r = (passed: boolean, completed = true) => ({ experiment_id: "x", request: { world_id: "w", change_id: "c", variant: "candidate" as const, observe: [] }, completed, observations: {}, assertions: [{ name: "loader.loads_input", passed, detail: "" }], logs_tail: "", artifacts: [], duration_ms: 0 });
    expect(judgeFix([r(true), r(true)], [r(true)]).status).toBe("verified");
    expect(judgeFix([r(true), r(false)], [r(true)]).status).toBe("failed");
    expect(judgeFix([r(true), r(true)], [r(false)]).reasons.join(" ")).toContain("breaks normal operation");
    expect(judgeFix([r(true, false)], [r(true)]).status).toBe("untested");
  });

  it("verifies a fix that holds, without changing the verdict", async () => {
    const { summary, bundle } = await run([fix("loader.max_items", "120")]);
    expect(summary.verdict).toBe("reproduced_failure");
    expect(summary.fix).toBe("verified");
    expect(bundle.verdict.fix_verification).toMatchObject({ status: "verified", overrides: { "loader.max_items": 120 }, rounds: 1 });
    expect(bundle.verdict.mitigation?.verified).toBe(true);
  });

  it("gives the investigator one more attempt when the fix does not hold", async () => {
    const { summary, bundle } = await run([fix("loader.max_items", "55"), fix("loader.max_items", "100", "raise max_items to 100")]);
    expect(summary.fix).toBe("verified");
    expect(bundle.verdict.fix_verification).toMatchObject({ rounds: 2, overrides: { "loader.max_items": 100 } });
    expect(bundle.verdict.fix_verification?.experiments).toHaveLength(6);
    expect(bundle.verdict.mitigation?.text).toBe("raise max_items to 100");
    expect(summary.verdict).toBe("reproduced_failure"); // fix runs never feed the main judge
  });

  it("reports a fix that never holds as failed, and says so in the limits", async () => {
    const { summary, bundle } = await run([fix("loader.max_items", "55"), fix("loader.max_items", "52")]);
    expect(summary.fix).toBe("failed");
    expect(bundle.verdict.mitigation?.verified).toBe(false);
    expect(bundle.verdict.limitations.join(" ")).toContain("did not hold");
  });

  it("retries once on an invalid override, then gives up as untested", async () => {
    const { summary } = await run([fix("loader.timeout", "5"), fix("loader.timeout", "9")]);
    expect(summary.fix).toBe("untested");
  });
});

describe("finish robustness (seen live with Nemotron)", () => {
  const experiment = [{ name: "run_experiment", args: { variant: "candidate", observe: ["consumer_status"], hypothesis_ids: [], rationale: "test" } }];
  const finishWith = (extra: Record<string, unknown>) => [{ name: "finish", args: { headline: "Loader rejects", prediction: "breaks", cause_claim: "60 > 50", supported_hypothesis_ids: [], limitations: [], ...extra } }];
  const go = async (steps: Array<Array<{ name: string; args: unknown }>>) => {
    const out = await mkdtemp(join(tmpdir(), "domino-finish-"));
    return investigate({ changeId: "stub-chg-1", mode: "full", outDir: out, model: scripted([experiment, ...steps]), evidence: new StubEvidence(), worlds: new StubWorlds() });
  };

  it("rescues the real ids from a mangled evidence string", async () => {
    const s = await go([finishWith({ mitigation: "raise the limit", evidence: '["x1": baseline rows=30, "x2": candidate rows=60]' }), fix("loader.max_items", "120")]);
    expect(s.cause_claim).toBe("60 > 50");
    expect(s.evidence_refs).toEqual(expect.arrayContaining(["x1", "x2"]));
  });

  it("keeps a mitigation proposed in an earlier, rejected finish", async () => {
    const s = await go([finishWith({ mitigation: "raise the limit", evidence: ["nothing-retrieved"] }), finishWith({ evidence: ["x2"] }), fix("loader.max_items", "120")]);
    expect(s.cause_claim).toBe("60 > 50");
    expect(s.fix).toBe("verified");
  });
});

describe("last-chance finish (seen live: 2 of 30 runs ended with no explanation)", () => {
  it("reads a finish call the model wrote as text", async () => {
    const { toolCallsFromText } = await import("../src/tools.js");
    const text = 'Here you go: [{"name": "finish", "parameters": {"headline": "h", "prediction": "breaks", "cause_claim": "60 > 50", "evidence": ["x2"]}}]';
    const calls = toolCallsFromText(text, ["finish"]);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]!.function.arguments).cause_claim).toBe("60 > 50");
    expect(toolCallsFromText('{"name": "query_usl", "arguments": {"sql": "x"}}', ["finish"])).toEqual([]);
    expect(toolCallsFromText("no json here", ["finish"])).toEqual([]);
  });

  it("accepts an explanation without a mitigation on the last attempt, rather than none", async () => {
    const experiment = [{ name: "run_experiment", args: { variant: "candidate", observe: ["consumer_status"], hypothesis_ids: [], rationale: "t" } }];
    const noMitigation = [{ name: "finish", args: { headline: "Loader rejects", prediction: "breaks", cause_claim: "60 entries exceed 50", evidence: ["x2"], supported_hypothesis_ids: [], limitations: [] } }];
    const idle = Array.from({ length: 19 }, () => [{ name: "inspect_world_model", args: {} }]);
    const out = await mkdtemp(join(tmpdir(), "domino-last-"));
    const s = await investigate({ changeId: "stub-chg-1", mode: "full", outDir: out, model: scripted([experiment, ...idle, noMitigation, noMitigation]), evidence: new StubEvidence(), worlds: new StubWorlds() });
    expect(s.cause_claim).toBe("60 entries exceed 50");
    const events = (await readFile(join(out, s.run_id, "trace.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    expect(events.find((e) => e.type === "verdict").limitations).toContain("No mitigation was proposed.");
  });
});

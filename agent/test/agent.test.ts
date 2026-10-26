import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TraceEvent } from "../../contracts/agent/types.js";
import { type ChatModel, investigate } from "../src/agent.js";
import { parseChange } from "../src/change.js";
import { StubEvidence, StubWorlds } from "../src/fakes/stubWorld.js";
import type { ChatRequest, ChatResult } from "../src/llm/nightshift.js";
import { checkReadOnlySql } from "../src/tools.js";

const NEMOTRON = "nvidia/nemotron-3.5-lightning-30b-a3b";

/** Plays back a fixed list of tool calls, the way Nemotron would emit them. */
class ScriptedModel implements ChatModel {
  calls: ChatRequest[] = [];
  constructor(private readonly script: Array<Array<{ name: string; args: Record<string, unknown> }>>) {}
  async chat(req: ChatRequest): Promise<ChatResult> {
    this.calls.push(req);
    const step = this.script.shift() ?? [{ name: "finish", args: { headline: "done", prediction: "unsure", supported_hypothesis_ids: [], limitations: [] } }];
    return {
      message: {
        role: "assistant",
        content: null,
        tool_calls: step.map((c, i) => ({ id: `c${this.calls.length}-${i}`, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })),
      },
      finishReason: "tool_calls",
      receipt: { schema: null, receiptId: null, requestId: "r", routedModel: NEMOTRON, providerModel: NEMOTRON, reason: null, phaseModels: [NEMOTRON], cacheStatus: "miss", requestedModel: "meterless/auto", latencyMs: 1, attempts: 1, at: "", raw: {} },
      attempts: 1,
      latencyMs: 1,
    };
  }
}

const readTrace = async (dir: string, runId: string) =>
  (await readFile(join(dir, runId, "trace.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l) as TraceEvent);

describe("change parser", () => {
  it("extracts principals and objects from a grant", () => {
    const parsed = parseChange({ change_id: "c", world_id: "w", title: "t", description: "", files: [], diff: "+GRANT SELECT ON mirror.* TO svc_builder;\n" });
    expect(parsed.entities.map((e) => `${e.kind}:${e.id}`)).toEqual(expect.arrayContaining(["principal:svc_builder", "object:mirror.*"]));
  });
});

describe("SQL guard", () => {
  it("allows one SELECT and blocks writes and multiple statements", () => {
    expect(checkReadOnlySql("SELECT * FROM grants;")).toBe("SELECT * FROM grants");
    expect(() => checkReadOnlySql("DROP TABLE grants")).toThrow();
    expect(() => checkReadOnlySql("SELECT 1; SELECT 2")).toThrow();
    expect(() => checkReadOnlySql("WITH x AS (SELECT 1) DELETE FROM grants")).toThrow();
  });
});

describe("investigation loop", () => {
  it("runs end to end, confirms the failure itself and lets the judge decide", async () => {
    const out = await mkdtemp(join(tmpdir(), "domino-"));
    const model = new ScriptedModel([
      [{ name: "get_dependency_path", args: { entity: "svc_builder" } }],
      [
        {
          name: "record_hypothesis",
          args: { claim: "loader rejects items.list", mechanism: "wider read → more entries than loader limit", evidence_for: ["s1", "l1", "made-up-row"], evidence_against: [], falsified_by: "candidate loads fine", confidence: 0.6 },
        },
      ],
      [{ name: "run_experiment", args: { variant: "baseline", observe: ["artifact_entries", "consumer_status"], hypothesis_ids: ["h1"], rationale: "reference" } }],
      [{ name: "run_experiment", args: { variant: "candidate", observe: ["artifact_entries", "consumer_status"], hypothesis_ids: ["h1"], rationale: "test" } }],
      [{ name: "update_hypothesis", args: { hypothesis_id: "h1", status: "supported", note: "candidate failed" } }],
      [{ name: "finish", args: { headline: "Loader rejects the build output", prediction: "breaks", cause_claim: "the grant duplicates the read: 30 → 60 rows, past max_items 50", mitigation: "filter by schema", evidence: ["l1"], supported_hypothesis_ids: ["h1"], limitations: [] } }],
    ]);

    const summary = await investigate({ changeId: "stub-chg-1", mode: "full", outDir: out, model, evidence: new StubEvidence(), worlds: new StubWorlds() });

    expect(summary.verdict).toBe("reproduced_failure");
    expect(summary.model_prediction).toBe("breaks");
    expect(summary.all_calls_nemotron).toBe(true);
    expect([...summary.evidence_refs].sort()).toEqual(["l1", "s1"]); // invented ref dropped
    // model ran baseline + candidate; harness added a repeat candidate + a control
    expect(summary.experiments).toBe(4);

    const events = await readTrace(out, summary.run_id);
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    const verdict = events.find((e) => e.type === "verdict");
    expect(verdict).toMatchObject({ verdict: "reproduced_failure", decided_by: "deterministic_judge" });
    expect(events.filter((e) => e.type === "model_call").every((e) => (e as any).routed_model === NEMOTRON)).toBe(true);
  });

  it("does not call a safe change broken", async () => {
    const out = await mkdtemp(join(tmpdir(), "domino-"));
    const model = new ScriptedModel([
      [{ name: "run_experiment", args: { variant: "baseline", observe: ["consumer_status"], hypothesis_ids: [], rationale: "reference" } }],
      [{ name: "run_experiment", args: { variant: "candidate", observe: ["consumer_status"], hypothesis_ids: [], rationale: "test" } }],
      [{ name: "finish", args: { headline: "No impact seen", prediction: "safe", cause_claim: "consumer unaffected", evidence: ["x1"], supported_hypothesis_ids: [], limitations: ["single workload"] } }],
    ]);
    const summary = await investigate({ changeId: "stub-chg-2", mode: "full", outDir: out, model, evidence: new StubEvidence(), worlds: new StubWorlds() });
    expect(summary.verdict).toBe("no_failure_observed");
    expect(summary.experiments).toBe(2);
  });

  it("hides experiment tools in no_experiments mode", async () => {
    const out = await mkdtemp(join(tmpdir(), "domino-"));
    const model = new ScriptedModel([[{ name: "run_experiment", args: { variant: "candidate", observe: [], hypothesis_ids: [], rationale: "x" } }]]);
    const summary = await investigate({ changeId: "stub-chg-1", mode: "no_experiments", outDir: out, model, evidence: new StubEvidence(), worlds: new StubWorlds() });
    expect(model.calls[0]!.tools!.map((t) => t.function.name)).not.toContain("run_experiment");
    expect(summary.experiments).toBe(0);
    expect(summary.verdict).toBe("inconclusive");
  });
});

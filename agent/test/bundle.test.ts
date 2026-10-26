import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EvidenceBundle } from "../../contracts/agent/types.js";
import { type ChatModel, investigate } from "../src/agent.js";
import { writeBundle } from "../src/bundle.js";
import { StubEvidence, StubWorlds } from "../src/fakes/stubWorld.js";
import type { ChatResult } from "../src/llm/nightshift.js";

const NEMOTRON = "nvidia/nemotron-3.5-lightning-30b-a3b";
const steps = [
  [{ name: "get_dependency_path", args: { entity: "svc_builder" } }],
  [{ name: "run_experiment", args: { variant: "candidate", observe: ["artifact_entries", "consumer_status"], hypothesis_ids: [], rationale: "test" } }],
  [{ name: "finish", args: { headline: "Loader rejects items.list", prediction: "breaks", cause_claim: "wider read doubles entries 30 → 60, past max_items 50", mitigation: "filter the builder query to one schema", evidence: ["l1", "s1"], supported_hypothesis_ids: [], limitations: [] } }],
  [{ name: "propose_fix", args: { overrides: [{ target: "builder.schema_filter", value: "main" }], mitigation: "filter the builder query to one schema" } }],
];
const model: ChatModel = {
  async chat(): Promise<ChatResult> {
    const step = steps.shift()!;
    return {
      message: { role: "assistant", content: null, tool_calls: step.map((c, i) => ({ id: `c${i}`, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })) },
      finishReason: "tool_calls",
      receipt: { schema: null, receiptId: null, requestId: `req-${steps.length}`, routedModel: NEMOTRON, providerModel: NEMOTRON, reason: null, phaseModels: [NEMOTRON], cacheStatus: "miss", requestedModel: "meterless/auto", latencyMs: 5, attempts: 1, at: "", raw: {} },
      attempts: 1,
      latencyMs: 5,
    };
  },
};

describe("evidence bundle", () => {
  it("builds the bundle and PR report from the trace alone", async () => {
    const out = await mkdtemp(join(tmpdir(), "domino-bundle-"));
    const summary = await investigate({ changeId: "stub-chg-1", mode: "full", outDir: out, model, evidence: new StubEvidence(), worlds: new StubWorlds() });
    const runDir = join(out, summary.run_id);
    const bundle: EvidenceBundle = await writeBundle(runDir, summary.cause_claim);

    expect(bundle.verdict.verdict).toBe("reproduced_failure");
    expect(bundle.verdict.mitigation).toEqual({ text: "filter the builder query to one schema", verified: true });
    expect(bundle.verdict.fix_verification).toMatchObject({ status: "verified", overrides: { "builder.schema_filter": "main" }, rounds: 1 });
    expect(bundle.causal_chain.map((c) => c.edge)).toEqual(["svc_builder identity_of builder", "builder produces items.list", "items.list consumed_by loader"]);
    // every link cites rows; a row only shows content if the run actually retrieved it
    expect(bundle.causal_chain.every((c) => c.evidence.length > 0 && c.evidence.every((e) => e.row_id))).toBe(true);
    expect(bundle.causal_chain.flatMap((c) => c.evidence).every((e) => e.facts === "")).toBe(true); // stub run never queried these rows
    // paired baseline + model's candidate + harness repeat + harness control
    // paired baseline + model's candidate + harness repeat + harness control, then the fix: candidate ×2 + baseline
    expect(bundle.experiments.map((x) => `${x.variant}:${x.requested_by}${x.fix_overrides ? "+fix" : ""}`)).toEqual([
      "baseline:harness", "candidate:agent", "candidate:harness", "control:harness", "candidate:harness+fix", "candidate:harness+fix", "baseline:harness+fix",
    ]);
    expect(bundle.verdict.tested).toHaveLength(4); // the verdict rests on the original runs only
    expect(bundle.models).toMatchObject({ calls: 4, failed: 0, all_nemotron: true, provider: "Meterless Nightshift" });
    expect(bundle.world_model.writes).toBeGreaterThan(0);

    const report = await readFile(join(runDir, "report.md"), "utf8");
    expect(report).toContain("failure reproduced under tested conditions");
    expect(report).toContain("✅ Verified fix:");
    expect(report).toContain("`builder.schema_filter=main`");
    expect(report).toMatch(/\| candidate \+ fix ·harness \|.*✅ pass/);
    expect(report).toContain("all NVIDIA Nemotron");
    expect(report).toMatch(/\| control \(change reverted\) ·harness \|.*✅ pass/);
  });
});

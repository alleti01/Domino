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
  [{ name: "finish", args: { headline: "Loader rejects items.list", prediction: "breaks", cause_claim: "wider read doubles entries past max_items", mitigation: "filter the builder query to one schema", evidence: ["l1", "s1"], supported_hypothesis_ids: [], limitations: [] } }],
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
    expect(bundle.verdict.mitigation).toEqual({ text: "filter the builder query to one schema", verified: false });
    expect(bundle.causal_chain.map((c) => c.edge)).toEqual(["svc_builder identity_of builder", "builder produces items.list", "items.list consumed_by loader"]);
    expect(bundle.causal_chain.every((c) => c.evidence.every((e) => e.row_id && e.facts))).toBe(true);
    // paired baseline + model's candidate + harness repeat + harness control
    expect(bundle.experiments.map((x) => `${x.variant}:${x.requested_by}`)).toEqual(["baseline:harness", "candidate:agent", "candidate:harness", "control:harness"]);
    expect(bundle.models).toMatchObject({ calls: 3, failed: 0, all_nemotron: true, provider: "Meterless Nightshift" });
    expect(bundle.world_model.writes).toBeGreaterThan(0);

    const report = await readFile(join(runDir, "report.md"), "utf8");
    expect(report).toContain("failure reproduced under tested conditions");
    expect(report).toContain("not verified by Domino");
    expect(report).toContain("all NVIDIA Nemotron");
    expect(report).toMatch(/\| control \(change reverted\) ·harness \|.*✅ pass/);
  });
});

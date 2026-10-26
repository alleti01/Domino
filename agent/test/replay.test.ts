import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TraceEvent } from "../../contracts/agent/types.js";
import { type ChatModel, investigate } from "../src/agent.js";
import { StubEvidence, StubWorlds } from "../src/fakes/stubWorld.js";
import type { ChatRequest, ChatResult } from "../src/llm/nightshift.js";
import { CassetteOutOfDate, Player, Recorder } from "../src/replay.js";

const NEMOTRON = "nvidia/nemotron-3.5-lightning-30b-a3b";
const script = [
  [{ name: "get_dependency_path", args: { entity: "svc_builder" } }],
  [{ name: "run_experiment", args: { variant: "candidate", observe: ["consumer_status"], hypothesis_ids: [], rationale: "test" } }],
  [{ name: "finish", args: { headline: "loader rejects", prediction: "breaks", cause_claim: "wider read: 60 entries exceed 50", mitigation: "filter by schema", evidence: ["l1"], supported_hypothesis_ids: [], limitations: [] } }],
  [{ name: "propose_fix", args: { overrides: [{ target: "builder.schema_filter", value: "main" }], mitigation: "filter by schema" } }],
];
const scripted = (): ChatModel => {
  const steps = structuredClone(script);
  return {
    async chat(_req: ChatRequest): Promise<ChatResult> {
      const step = steps.shift()!;
      return {
        message: { role: "assistant", content: null, tool_calls: step.map((c, i) => ({ id: `c${i}`, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })) },
        finishReason: "tool_calls",
        receipt: { schema: "meterless.compute_receipt.v1", receiptId: "r", requestId: "r", routedModel: NEMOTRON, providerModel: NEMOTRON, reason: null, phaseModels: [NEMOTRON], cacheStatus: "miss", requestedModel: "meterless/auto", latencyMs: 1, attempts: 1, at: "", raw: {} },
        attempts: 1,
        latencyMs: 1,
      };
    },
  };
};
const readTrace = async (dir: string) => (await readFile(join(dir, "trace.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l) as TraceEvent);

describe("record / replay", () => {
  it("replays a recorded run through the real agent with no model or data layer, reaching the same verdict", async () => {
    const out = await mkdtemp(join(tmpdir(), "domino-rec-"));
    const recorder = new Recorder("stub-chg-1", "full", "stub");
    const live = await investigate({
      changeId: "stub-chg-1",
      mode: "full",
      outDir: out,
      model: recorder.model(scripted()),
      evidence: recorder.evidence(new StubEvidence()),
      worlds: recorder.worlds(new StubWorlds()),
    });
    const path = join(out, "cassette.json");
    await recorder.save(path, live);

    const player = await Player.load(path);
    const replayed = await investigate({ changeId: "stub-chg-1", mode: "full", outDir: out, model: player.model(), evidence: player.evidence(), worlds: player.worlds(), replay: true });

    expect(live.verdict).toBe("reproduced_failure");
    expect(replayed.verdict).toBe(live.verdict);
    expect(replayed.experiments).toBe(live.experiments);
    expect(replayed.all_calls_nemotron).toBe(true); // recorded receipts travel with the replay
    expect(player.unusedModelResponses()).toBe(0);
    const events = await readTrace(join(out, replayed.run_id));
    expect(events.every((e) => e.replay === true)).toBe(true);
    expect((await readTrace(join(out, live.run_id))).every((e) => e.replay === false)).toBe(true);
  });

  it("refuses to silently replay a recording the agent no longer matches", async () => {
    const player = new Player({ version: 1, recorded_at: "", change_id: "x", mode: "full", data_source: "stub", model: [], calls: [] });
    await expect(player.worlds().getChange("x")).rejects.toBeInstanceOf(CassetteOutOfDate);
  });
});

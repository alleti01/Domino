import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TraceEvent } from "../../contracts/agent/types.js";
import { type ChatModel, investigate } from "../src/agent.js";
import { StubEvidence, StubWorlds } from "../src/fakes/stubWorld.js";
import type { ChatRequest, ChatResult } from "../src/llm/nightshift.js";

const LIGHTNING = "nvidia/nemotron-3.5-lightning-30b-a3b";
const ULTRA = "nvidia/nemotron-3-ultra-550b-a55b";
const reply = (model: string, calls: Array<{ name: string; args: unknown }>): ChatResult => ({
  message: { role: "assistant", content: null, tool_calls: calls.map((c, i) => ({ id: `c${i}`, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })) },
  finishReason: "tool_calls",
  receipt: { schema: null, receiptId: null, requestId: "r", routedModel: model, providerModel: model, reason: null, phaseModels: [model], cacheStatus: "miss", requestedModel: model, latencyMs: 1, attempts: 1, at: "", raw: {} },
  attempts: 1,
  latencyMs: 1,
});
const finish = (claim: string) => ({ name: "finish", args: { headline: "loader rejects items.list", prediction: "breaks", cause_claim: claim, mitigation: "filter the read to one schema", evidence: ["l1"], supported_hypothesis_ids: [], limitations: [] } });

class TwoModelScript implements ChatModel {
  requests: ChatRequest[] = [];
  private investigator = [
    [{ name: "get_dependency_path", args: { entity: "svc_builder" } }],
    [{ name: "query_usl", args: { sql: "SELECT * FROM limits", purpose: "consumer limits" } }],
    [{ name: "run_experiment", args: { variant: "candidate", observe: ["artifact_entries", "consumer_status"], hypothesis_ids: [], rationale: "test" } }],
    [finish("entries double to 60 and the loader also runs out of memory")],
    [finish("entries double from 30 to 60, past the loader's max_items of 50")],
  ];
  private reviews = [
    { approved: false, issues: [{ statement: "the loader also runs out of memory", problem: "no evidence of memory use anywhere", refs: [] }] },
    { approved: true, issues: [] },
  ];
  async chat(req: ChatRequest): Promise<ChatResult> {
    this.requests.push(req);
    if (req.purpose === "review") return reply(ULTRA, [{ name: "submit_review", args: this.reviews.shift() }]);
    return reply(LIGHTNING, this.investigator.shift()!);
  }
}

describe("independent reviewer", () => {
  it("sends an unsupported claim back to the investigator, then approves the corrected explanation", async () => {
    const out = await mkdtemp(join(tmpdir(), "domino-critic-"));
    const model = new TwoModelScript();
    const summary = await investigate({
      changeId: "stub-chg-1",
      mode: "full",
      outDir: out,
      model,
      evidence: new StubEvidence(),
      worlds: new StubWorlds(),
      investigatorModel: LIGHTNING,
      critic: { model: ULTRA, maxRounds: 2, revisionSteps: 3 },
    });

    expect(model.requests.filter((r) => r.purpose === "review").map((r) => r.model)).toEqual([ULTRA, ULTRA]);
    expect(model.requests.filter((r) => r.purpose !== "review").every((r) => r.model === LIGHTNING)).toBe(true);
    // the reviewer's complaint reached the investigator
    const revisionPrompt = model.requests[5]!.messages.find((m) => m.role === "user" && m.content?.includes("independent reviewer"));
    expect(revisionPrompt?.content).toContain("no evidence of memory use");
    expect(summary.cause_claim).toBe("entries double from 30 to 60, past the loader's max_items of 50");
    expect(summary.verdict).toBe("reproduced_failure");
    expect(summary.all_calls_nemotron).toBe(true);

    const events = (await readFile(join(out, summary.run_id, "trace.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l) as TraceEvent);
    expect(events.filter((e) => e.type === "review").map((e: any) => e.outcome)).toEqual(["sent_back", "approved"]);
  });

  it("records an unavailable reviewer without failing the investigation", async () => {
    const out = await mkdtemp(join(tmpdir(), "domino-critic-"));
    const inner = new TwoModelScript();
    const model: ChatModel = {
      chat: async (req) => {
        if (req.purpose === "review") throw new Error("Ultra 500");
        return inner.chat(req);
      },
    };
    const summary = await investigate({ changeId: "stub-chg-1", mode: "full", outDir: out, model, evidence: new StubEvidence(), worlds: new StubWorlds(), critic: { model: ULTRA, maxRounds: 2, revisionSteps: 3 } });
    expect(summary.verdict).toBe("reproduced_failure");
    expect(summary.outage).toBe(false);
    const events = (await readFile(join(out, summary.run_id, "trace.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l) as TraceEvent);
    expect(events.find((e) => e.type === "review")).toMatchObject({ outcome: "unavailable" });
  });

  it("reads a review written as prose JSON instead of a tool call", async () => {
    const { extractReview } = await import("../src/critic.js");
    expect(extractReview('Here is my review: {"approved": false, "issues": [{"statement": "x", "problem": "y"}]} Thanks.')).toEqual({ approved: false, issues: [{ statement: "x", problem: "y" }] });
    expect(extractReview("I think it is fine.")).toBeNull();
  });
});

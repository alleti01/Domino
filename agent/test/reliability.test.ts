import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type ChatModel, investigate } from "../src/agent.js";
import { StubEvidence, StubWorlds } from "../src/fakes/stubWorld.js";
import { type ChatResult, NightshiftError } from "../src/llm/nightshift.js";

const NEMOTRON = "nvidia/nemotron-3.5-lightning-30b-a3b";
const finish = (cache = "miss"): ChatResult => ({
  message: {
    role: "assistant",
    content: null,
    tool_calls: [{ id: "c", type: "function", function: { name: "finish", arguments: JSON.stringify({ headline: "h", prediction: "unsure", cause_claim: "c", evidence: [], supported_hypothesis_ids: [], limitations: [] }) } }],
  },
  finishReason: "tool_calls",
  receipt: { schema: null, receiptId: null, requestId: "r", routedModel: NEMOTRON, providerModel: NEMOTRON, reason: null, phaseModels: [NEMOTRON], cacheStatus: cache, requestedModel: "meterless/auto", latencyMs: 1, attempts: 1, at: "", raw: {} },
  attempts: 1,
  latencyMs: 1,
});
const run = async (model: ChatModel, healthy = true) =>
  investigate({
    changeId: "stub-chg-1",
    mode: "full",
    outDir: await mkdtemp(join(tmpdir(), "domino-rel-")),
    model,
    evidence: new StubEvidence(),
    worlds: new StubWorlds(),
    budgets: { max_steps: 3 },
    healthCheck: async () => ({ ok: healthy, detail: healthy ? "ok" : "Nightshift offline" }),
  });

describe("reliability", () => {
  it("treats a failed health check as an outage and never calls the model", async () => {
    let calls = 0;
    const summary = await run({ chat: async () => (calls++, finish()) }, false);
    expect(calls).toBe(0);
    expect(summary.outage).toBe(true);
    expect(summary.verdict).toBe("inconclusive");
  });

  it("retries once when Nightshift routes to a non-Nemotron model", async () => {
    let calls = 0;
    const summary = await run({
      chat: async () => {
        if (calls++ === 0) throw new NightshiftError("Receipt shows a non-Nemotron model", "non_nemotron");
        return finish();
      },
    });
    expect(summary.model_failures).toBe(1);
    expect(summary.all_calls_nemotron).toBe(true);
    expect(summary.outage).toBe(false);
  });

  it("marks a mid-run model outage and counts cache hits", async () => {
    let calls = 0;
    const summary = await run({
      chat: async () => {
        if (calls++ === 0) return { ...finish("hit"), message: { role: "assistant", content: "thinking", tool_calls: [] } };
        throw new NightshiftError("Nightshift 502", "upstream", 502);
      },
    });
    expect(summary.cache_hits).toBe(1);
    expect(summary.outage).toBe(true);
    expect(summary.verdict).toBe("inconclusive");
  });

  it("forces a finish when the step budget runs out, so every run has an explanation", async () => {
    const seen: string[][] = [];
    const summary = await investigate({
      changeId: "stub-chg-1",
      mode: "full",
      outDir: await mkdtemp(join(tmpdir(), "domino-rel-")),
      evidence: new StubEvidence(),
      worlds: new StubWorlds(),
      budgets: { max_steps: 3 },
      model: {
        chat: async (req) => {
          const names = (req.tools ?? []).map((t) => t.function.name);
          seen.push(names);
          if (names.length === 1 && names[0] === "finish") {
            return {
              ...finish(),
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{ id: "f", type: "function", function: { name: "finish", arguments: JSON.stringify({ headline: "forced", prediction: "unsure", cause_claim: "ran out of steps", evidence: ["g1"], supported_hypothesis_ids: [], limitations: ["budget"] }) } }],
              },
            };
          }
          return { ...finish(), message: { role: "assistant", content: null, tool_calls: [{ id: "q", type: "function", function: { name: "get_dependency_path", arguments: JSON.stringify({ entity: "svc_builder" }) } }] } };
        },
      },
    });
    expect(seen.at(-1)).toEqual(["finish"]);
    expect(summary.cause_claim).toBe("ran out of steps");
    expect(summary.model_prediction).toBe("unsure");
  });

  it("flags a prediction that contradicts the experiments", async () => {
    const out = await mkdtemp(join(tmpdir(), "domino-rel-"));
    const steps = [
      [{ name: "get_dependency_path", args: { entity: "svc_reports" } }],
      [{ name: "run_experiment", args: { variant: "candidate", observe: ["consumer_status"], hypothesis_ids: [], rationale: "t" } }],
      [{ name: "finish", args: { headline: "breaks", prediction: "breaks", cause_claim: "c", mitigation: "m", evidence: ["g2"], supported_hypothesis_ids: [], limitations: [] } }],
    ];
    const summary = await investigate({
      changeId: "stub-chg-2", // the safe stub change
      mode: "full",
      outDir: out,
      evidence: new StubEvidence(),
      worlds: new StubWorlds(),
      model: { chat: async () => ({ ...finish(), message: { role: "assistant", content: null, tool_calls: (steps.shift() ?? []).map((c, i) => ({ id: `s${i}`, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.args) } })) } }) },
    });
    expect(summary.verdict).toBe("no_failure_observed");
    const trace = await (await import("node:fs/promises")).readFile(join(out, summary.run_id, "trace.jsonl"), "utf8");
    expect(trace).toContain("predicted a failure, but the experiments showed none");
  });

  it("recovers from an empty completion mid-run instead of calling it an outage", async () => {
    let calls = 0;
    const seenChoice: string[] = [];
    const summary = await run({
      chat: async (req) => {
        seenChoice.push(String(req.toolChoice));
        if (++calls === 2) throw new NightshiftError("Nightshift returned an empty completion", "bad_response");
        return finish();
      },
    });
    expect(summary.outage).toBe(false);
    expect(seenChoice[2]).toBe("required"); // the step after the empty reply forces a tool call
  });
});

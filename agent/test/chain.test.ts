import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExperimentResult } from "../../contracts/agent/types.js";
import { type ChatModel, investigate } from "../src/agent.js";
import { writeBundle } from "../src/bundle.js";
import { checkChain, names, renderChain } from "../src/chain.js";
import { StubEvidence, StubWorlds } from "../src/fakes/stubWorld.js";
import type { ChatRequest, ChatResult } from "../src/llm/nightshift.js";

const NEMOTRON = "nvidia/nemotron-3.5-lightning-30b-a3b";
const exp = (id: string, variant: "baseline" | "candidate", ok: boolean): ExperimentResult => ({
  experiment_id: id,
  request: { world_id: "w", change_id: "w/change/0042", variant, observe: [] },
  completed: true,
  observations: { "gateway.p99_latency_ms": ok ? 70 : 240, "gateway.failed": ok ? 0 : 2838 },
  assertions: [{ name: "gateway_success_rate", passed: ok, detail: ok ? "observed 1.0" : "observed 0.165, expected >= 0.99" }],
  logs_tail: "",
  artifacts: [],
  duration_ms: 0,
});
const ctx = (experiments: ExperimentResult[]) => ({
  changeId: "w/change/0042",
  changeRows: new Set(["catalog:ic-1"]),
  isKnownRef: (r: string) => ["catalog:ic-1", "catalog:ic-2", ...experiments.map((x) => x.experiment_id)].includes(r),
  rowFact: (r: string) => (r === "catalog:ic-2" ? "gateway.timeout_ms = 250" : undefined),
  experiments,
});

describe("cited cause chain (P1)", () => {
  const failing = [exp("x1", "baseline", true), exp("x2", "candidate", false)];

  it("accepts a chain from the change to the failed check, and writes the prose from it", () => {
    const c = checkChain(
      [
        { claim: "the change adds a synchronous call to order-service", cites: ["catalog:ic-1"] },
        { claim: "the gateway gives up after 250 ms", cites: ["catalog:ic-2"] },
        { claim: "p99 rises 70 → 240 ms, so gateway_success_rate fails", cites: ["x2: gateway.p99_latency_ms 70 → 240"] },
      ],
      ctx(failing),
    );
    expect(c.problems).toEqual([]);
    expect(c.refs.sort()).toEqual(["catalog:ic-1", "catalog:ic-2", "x2"]);
    expect(renderChain(c.hops)).toBe(
      "the change adds a synchronous call to order-service [catalog:ic-1] → the gateway gives up after 250 ms [catalog:ic-2] → p99 rises 70 → 240 ms, so gateway_success_rate fails [x2: gateway.p99_latency_ms 70 → 240].",
    );
  });

  it("rejects uncited hops, invented cites, an unanchored start and an ending short of the failed check", () => {
    const c = checkChain(
      [
        { claim: "order-service gets slower", cites: ["catalog:ic-2"] },
        { claim: "a queue builds up", cites: ["row-made-up"] },
        { claim: "requests time out", cites: ["x2"] },
      ],
      ctx(failing),
    );
    expect(c.problems.join(" | ")).toContain('cites "row-made-up", which this run never returned');
    expect(c.problems.join(" | ")).toContain("cites no row_id or experiment_id");
    expect(c.problems.join(" | ")).toContain("hop 1 must start at the change w/change/0042");
    expect(c.problems.join(" | ")).toContain("the chain must end at the failed check (gateway_success_rate)");
    expect(c.hops.map((h) => h.claim)).toEqual(["order-service gets slower", "requests time out"]); // only cited hops survive
  });

  it("accepts a failed check named one hop before the last, when the last hop still cites the failing run", () => {
    const c = checkChain(
      [
        { claim: "the change adds a synchronous call", cites: ["catalog:ic-1"] },
        { claim: "gateway_success_rate drops to 0.165", cites: ["x2: gateway_success_rate observed 0.165"] },
        { claim: "2838 requests fail", cites: ["x2: gateway.failed 0 → 2838"] },
      ],
      ctx(failing),
    );
    expect(c.problems).toEqual([]);
  });

  it("asks for at least two hops", () => {
    expect(checkChain([{ claim: "w/change/0042 breaks gateway_success_rate", cites: ["x2"] }], ctx(failing)).problems).toContain("write at least two hops: from the change to the outcome");
    expect(checkChain(undefined, ctx(failing)).problems.length).toBeGreaterThan(0);
  });

  it("matches metric and check names loosely but not by accident", () => {
    expect(names("p99 latency went 60 → 100", "gateway.p99_latency_ms")).toBe(true);
    expect(names("gateway_success_rate fails", "gateway_success_rate")).toBe(true);
    expect(names("success went down", "gateway_success_rate")).toBe(false);
  });
});

describe("safe changes are explained from the chain too (P2)", () => {
  const safe = [exp("x1", "baseline", true), exp("x2", "candidate", true)];

  it("needs the last hop to say which metric stayed within bounds, citing the candidate", () => {
    const bare = checkChain(
      [
        { claim: "the change adds a call", cites: ["catalog:ic-1"] },
        { claim: "nothing failed", cites: ["x1"] },
      ],
      ctx(safe),
    );
    expect(bare.problems.join(" ")).toContain("nothing failed, so the last hop must say where the chain stops");
    const explained = checkChain(
      [
        { claim: "the change adds a call", cites: ["catalog:ic-1"] },
        { claim: "the gateway allows 250 ms", cites: ["catalog:ic-2"] },
        { claim: "p99 latency stays at 70 ms, under the 250 ms timeout", cites: ["x2"] },
      ],
      ctx(safe),
    );
    expect(explained.problems).toEqual([]);
  });
});

describe("the finish tool enforces the chain", () => {
  const scripted = (steps: unknown[][], seen: string[]): ChatModel => ({
    async chat(req: ChatRequest): Promise<ChatResult> {
      const tool = req.messages.filter((m) => m.role === "tool").at(-1);
      if (tool) seen.push(String(tool.content));
      const step = (steps.shift() ?? []) as Array<{ name: string; args: unknown }>;
      return {
        message: { role: "assistant", content: null, tool_calls: step.map((c, i) => ({ id: `c${i}`, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })) },
        finishReason: "tool_calls",
        receipt: { schema: null, receiptId: null, requestId: "r", routedModel: NEMOTRON, providerModel: NEMOTRON, reason: null, phaseModels: [NEMOTRON], cacheStatus: "miss", requestedModel: NEMOTRON, latencyMs: 1, attempts: 1, at: "", raw: {} },
        attempts: 1,
        latencyMs: 1,
      };
    },
  });
  const experiment = [{ name: "run_experiment", args: { variant: "candidate", observe: ["query_rows", "consumer_status"], hypothesis_ids: [], rationale: "t" } }];
  const finish = (chain: unknown) => [{ name: "finish", args: { cause_chain: chain, headline: "Loader rejects", prediction: "breaks", mitigation: "filter by schema", evidence: [], supported_hypothesis_ids: [], limitations: [] } }];
  const uncited = [
    { claim: "the grant widens the read", cites: [] },
    { claim: "rows 30 → 60 exceed max_items 50", cites: ["made-up"] },
  ];
  const good = [
    { claim: "stub-chg-1 widens what svc_builder reads", cites: ["x2"] },
    { claim: "builder rows 30 → 60 pass max_items 50, so loader.loads_input fails", cites: ["x2: loader.loads_input"] },
  ];

  it("sends an uncited chain back once with what to fix, then records the cited one in the verdict", async () => {
    const seen: string[] = [];
    const out = await mkdtemp(join(tmpdir(), "domino-chain-"));
    const s = await investigate({ changeId: "stub-chg-1", mode: "full", outDir: out, model: scripted([experiment, finish(uncited), finish(good)], seen), evidence: new StubEvidence(), worlds: new StubWorlds() });
    expect(seen.find((t) => t.includes("cause_chain failed the citation check"))).toContain("loader.loads_input");
    expect(s.cause_claim).toBe(renderChain(good));
    expect(s.evidence_refs).toContain("x2");
    const verdict = (await readFile(join(out, s.run_id, "trace.jsonl"), "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.type === "verdict");
    expect(verdict.cause_chain).toEqual(good);
    expect(verdict.limitations.join(" ")).not.toContain("citation check");
    // P4: the bundle carries the chain with every cite resolved to what it shows, for the dashboard and report.
    await writeBundle(join(out, s.run_id), s.cause_claim);
    const bundle = JSON.parse(await readFile(join(out, s.run_id, "bundle.json"), "utf8"));
    expect(bundle.cause_chain_check).toBe("passed");
    expect(bundle.cause_chain[1].cites[0]).toMatchObject({ cite: "x2: loader.loads_input", refs: [{ ref: "x2", kind: "experiment" }] });
    expect(bundle.cause_chain[1].cites[0].refs[0].facts).toContain("failed loader.loads_input");
    expect(bundle.change.source).toBeNull();
    const report = await readFile(join(out, s.run_id, "report.md"), "utf8");
    expect(report).toContain("**Why, step by step** (every step cites evidence from this run)");
  });

  it("after one repair, keeps only the cited hops and says the check failed", async () => {
    const seen: string[] = [];
    const out = await mkdtemp(join(tmpdir(), "domino-chain-"));
    const half = [uncited[0], good[1]];
    const s = await investigate({ changeId: "stub-chg-1", mode: "full", outDir: out, model: scripted([experiment, finish(uncited), finish(half)], seen), evidence: new StubEvidence(), worlds: new StubWorlds() });
    expect(seen.filter((t) => t.includes("cause_chain failed the citation check"))).toHaveLength(1);
    expect(s.cause_claim).toBe(renderChain([good[1]!]));
    const verdict = (await readFile(join(out, s.run_id, "trace.jsonl"), "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.type === "verdict");
    expect(verdict.limitations.join(" ")).toContain("did not pass Domino's citation check");
    expect((await writeBundle(join(out, s.run_id), s.cause_claim)).cause_chain_check).toBe("failed");
  });
});

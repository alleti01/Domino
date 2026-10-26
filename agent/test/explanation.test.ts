import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type ChatModel, investigate } from "../src/agent.js";
import { StubEvidence, StubWorlds } from "../src/fakes/stubWorld.js";
import type { ChatRequest, ChatResult } from "../src/llm/nightshift.js";
import { describeDifferences, measuredNumbers, qualifyTables } from "../src/tools.js";

const NEMOTRON = "nvidia/nemotron-3.5-lightning-30b-a3b";
const TABLES = ["lightning.metastore.domino.systems.access_grant", "lightning.metastore.domino.systems.principal", "lightning.metastore.domino.systems.job"];
const exp = (variant: "baseline" | "candidate", rows: number, ok: boolean) => ({
  experiment_id: `x-${variant}`,
  request: { world_id: "w", change_id: "c", variant, observe: [] },
  completed: true,
  observations: { "builder.rows": rows, "runtime.status": ok ? "started" : "refused" },
  assertions: [{ name: "runtime.starts", passed: ok, detail: ok ? "ok" : "bundle too large" }],
  logs_tail: ok ? "" : "bundle has 280 entries but the runtime preallocates 200",
  artifacts: [],
  duration_ms: 0,
});

describe("semantic-layer names", () => {
  it("qualifies short and partial table names when exactly one full name matches", () => {
    expect(qualifyTables("SELECT * FROM access_grant g JOIN db_catalog.systems.principal p ON 1=1", TABLES)).toBe(
      "SELECT * FROM lightning.metastore.domino.systems.access_grant g JOIN lightning.metastore.domino.systems.principal p ON 1=1",
    );
    expect(qualifyTables("SELECT * FROM lightning.metastore.domino.systems.job", TABLES)).toBe("SELECT * FROM lightning.metastore.domino.systems.job");
    expect(qualifyTables("SELECT * FROM unknown_table", TABLES)).toBe("SELECT * FROM unknown_table");
    expect(qualifyTables("SELECT * FROM grants", ["grants", "services"])).toBe("SELECT * FROM grants"); // flat names: untouched
  });
});

describe("explanations walk the chain with measured numbers", () => {
  it("summarises what the experiments measured, including the failing log", () => {
    const d = describeDifferences(exp("baseline", 140, true), exp("candidate", 280, false));
    expect(d).toContain("builder.rows 140 → 280");
    expect(d).toContain("runtime.starts failed (bundle too large)");
    expect(d).toContain("preallocates 200");
    expect([...measuredNumbers([exp("baseline", 140, true), exp("candidate", 280, false)])].sort()).toEqual([140, 200, 280]);
  });

  const scripted = (steps: unknown[][], seen: ChatRequest[]): ChatModel => ({
    async chat(req): Promise<ChatResult> {
      seen.push(structuredClone(req));
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
  const finish = (cause: string) => [{ name: "finish", args: { headline: "Loader rejects", prediction: "breaks", cause_claim: cause, mitigation: "filter by schema", evidence: ["x2"], supported_hypothesis_ids: [], limitations: [] } }];
  const experiment = [{ name: "run_experiment", args: { variant: "candidate", observe: ["query_rows", "consumer_status"], hypothesis_ids: [], rationale: "t" } }];
  const fix = [{ name: "propose_fix", args: { overrides: [{ target: "builder.schema_filter", value: "main" }], mitigation: "filter by schema" } }];

  it("lists the full table names in the task, and shows the model the differences", async () => {
    const seen: ChatRequest[] = [];
    const out = await mkdtemp(join(tmpdir(), "domino-expl-"));
    await investigate({ changeId: "stub-chg-1", mode: "full", outDir: out, model: scripted([experiment, finish("rows 30 → 60 exceed max_items 50"), fix], seen), evidence: new StubEvidence(), worlds: new StubWorlds() });
    expect(String(seen[0]!.messages[1]!.content)).toContain("Semantic-layer tables (use these exact full names in SQL)");
    const toolReply = seen[1]!.messages.find((m) => m.role === "tool")!;
    expect(String(toolReply.content)).toContain("builder.query_rows 30 → 60");
  });

  it("sends back, once, an explanation that cites none of the measured numbers", async () => {
    const seen: ChatRequest[] = [];
    const out = await mkdtemp(join(tmpdir(), "domino-expl-"));
    const s = await investigate({ changeId: "stub-chg-1", mode: "full", outDir: out, model: scripted([experiment, finish("the wider read overflows the loader"), finish("the grant doubles builder rows 30 → 60; the loader allows 50, so loader.loads_input fails"), fix], seen), evidence: new StubEvidence(), worlds: new StubWorlds() });
    expect(s.cause_claim).toContain("30 → 60");
    const pushback = seen[2]!.messages.filter((m) => m.role === "tool").at(-1)!;
    expect(String(pushback.content)).toContain("Walk the chain");
    const trace = await readFile(join(out, s.run_id, "trace.jsonl"), "utf8");
    expect(trace).toContain('"verdict":"reproduced_failure"');
  });
});

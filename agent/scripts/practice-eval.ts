// Score the agent on Anish's practice scenarios. ONLY this script reads answers.json, and only
// after a run has finished; the agent never sees it.
//   npx tsx scripts/practice-eval.ts --set dev [--mode full] [--explain]
//   npx tsx scripts/practice-eval.ts --set heldout        (final check only; do not tune on it)

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { RunMode, TraceEvent } from "../../contracts/agent/types.js";
import { investigate } from "../src/agent.js";
import { DataLayerEvidence, DataLayerWorlds } from "../src/adapters/practice.js";
import { NightshiftClient, nightshiftHealth } from "../src/llm/nightshift.js";
import { ReceiptLog } from "../src/llm/receipts.js";

if (existsSync(".env")) process.loadEnvFile(".env");

// Fixed before any tuning. Twins are split across sets on purpose.
const SETS: Record<string, string[]> = {
  dev: ["p01", "p03", "p05", "p06", "p08"],
  heldout: ["p02", "p04", "p07", "p09", "p10"],
};

const { values } = parseArgs({
  options: {
    set: { type: "string", default: "dev" },
    worlds: { type: "string" },
    mode: { type: "string", default: "full" },
    repo: { type: "string", default: ".." },
    out: { type: "string", default: "runs/eval" },
    explain: { type: "boolean", default: false },
  },
});

const worlds = values.worlds ? values.worlds.split(",") : SETS[values.set!];
if (!worlds) throw new Error(`unknown set ${values.set}`);
const dataOpts = { repoDir: values.repo!, module: "practice" };
const outDir = join(values.out!, `${values.set}-${values.mode}-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 13)}`);
mkdirSync(outDir, { recursive: true });

const rows: any[] = [];
for (const world of worlds) {
  process.stdout.write(`${world} … `);
  const client = new NightshiftClient({ receiptLog: new ReceiptLog(join(outDir, "receipts.jsonl")) });
  const summary = await investigate({
    changeId: world,
    mode: values.mode as RunMode,
    outDir,
    healthCheck: () => nightshiftHealth(client),
    model: client,
    evidence: new DataLayerEvidence(dataOpts),
    worlds: new DataLayerWorlds(dataOpts),
  });

  // Scoring happens only now, after the run is complete.
  const answers = JSON.parse(readFileSync(join(values.repo!, "practice", "answers.json"), "utf8")).scenarios;
  const truth = answers[world];
  const events = readFileSync(join(outDir, summary.run_id, "trace.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as TraceEvent);
  const verdictEvent = events.find((e) => e.type === "verdict") as any;
  // key_evidence entries are facts ("processing_ms_p95=8100"). A fact counts as found when every
  // token of it appears in what the agent actually cited (row values, path details) or explained.
  const cited = new Set<string>([...summary.evidence_refs, ...(verdictEvent?.causal_chain ?? []).flatMap((c: any) => c.refs)]);
  const rowText = new Map<string, string>();
  for (const e of events as any[]) {
    if (e.type === "usl_query") for (const r of e.result.rows) rowText.set(r.row_id, Object.values(r.values).join(" "));
    if (e.type === "dependency_path") for (const ed of e.path.edges) for (const id of ed.row_ids ?? [ed.row_id]) rowText.set(id, `${rowText.get(id) ?? ""} ${ed.detail ?? ""}`);
  }
  const haystack = [summary.cause_claim ?? "", verdictEvent?.headline ?? "", ...[...cited].map((c) => rowText.get(c) ?? "")].join(" ").toLowerCase();
  const tokens = (fact: string) => fact.toLowerCase().split(/[^a-z0-9_.%]+/).filter((t) => t.length > 0 && t !== "->");
  const key: string[] = truth.key_evidence ?? [];
  const hits = key.filter((k) => tokens(k).every((t) => haystack.includes(t)));
  const row = {
    world,
    expected: truth.expected_verdict,
    verdict: summary.verdict,
    correct: summary.verdict === truth.expected_verdict,
    key_evidence: `${hits.length}/${key.length}`,
    calls: summary.model_calls,
    secs: Math.round(summary.duration_ms / 1000),
    nemotron: summary.all_calls_nemotron,
    outage: summary.outage,
    cache_hits: summary.cache_hits,
    model_failures: summary.model_failures,
    claim: summary.cause_claim ?? verdictEvent?.headline ?? "",
    truth: truth.explanation,
  };
  rows.push(row);
  console.log(`${row.verdict} (${row.correct ? "✓" : "✗ expected " + row.expected}) · key evidence ${row.key_evidence} · ${row.calls} calls · ${row.secs}s`);
}

const correct = rows.filter((r) => r.correct && !r.outage).length;
const scored = rows.filter((r) => !r.outage).length;
console.log(`\n${values.set} · mode ${values.mode}: ${correct}/${scored} verdicts correct (${rows.length - scored} outage runs excluded)`);
if (values.explain) {
  for (const r of rows) console.log(`\n[${r.world}] agent: ${r.claim}\n       truth: ${r.truth}`);
}
writeFileSync(join(outDir, "scorecard.json"), JSON.stringify(rows, null, 2));
console.log(`\nSaved ${join(outDir, "scorecard.json")}`);

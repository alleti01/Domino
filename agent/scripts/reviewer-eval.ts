// Planted-error test for the independent reviewer (Nemotron Ultra).
// Takes real recorded investigations, rebuilds exactly the evidence each one saw, and asks the
// reviewer to check five versions of each explanation: the clean original plus four with one
// planted error. Measures how often each kind of error is caught and how often clean ones pass.
//   npx tsx scripts/reviewer-eval.ts [--runs runs/worlds] [--limit 10]

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { ExperimentResult, TraceEvent, Verdict } from "../../contracts/agent/types.js";
import { REVIEWER_MODEL } from "../src/agent.js";
import { reviewExplanation } from "../src/critic.js";
import { rowFact } from "../src/facts.js";
import { quantities } from "../src/numbers.js";
import { NightshiftClient } from "../src/llm/nightshift.js";
import { ReceiptLog } from "../src/llm/receipts.js";
import { InvestigationState } from "../src/state.js";
import type { FinishArgs } from "../src/tools.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const { values } = parseArgs({ options: { runs: { type: "string", default: "runs/worlds" }, limit: { type: "string", default: "10" } } });

interface Case {
  world: string;
  title: string;
  diff: string;
  verdict: Verdict;
  judgeReasons: string[];
  finish: FinishArgs;
  state: InvestigationState;
}

function loadCase(runDir: string): Case | null {
  const events = readFileSync(join(runDir, "trace.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as TraceEvent) as any[];
  const summary = JSON.parse(readFileSync(join(runDir, "summary.json"), "utf8"));
  const start = events.find((e) => e.type === "run_started");
  const verdict = events.find((e) => e.type === "verdict");
  if (!start || !verdict || !summary.cause_claim || summary.outage) return null;
  const state = new InvestigationState();
  for (const e of events) {
    if (e.type === "usl_query") for (const r of e.result.rows) state.rowFacts.set(r.row_id, rowFact(r.values));
    if (e.type === "dependency_path")
      for (const edge of e.path.edges)
        for (const id of edge.row_ids?.length ? edge.row_ids : [edge.row_id])
          if (!state.rowFacts.has(id)) state.rowFacts.set(id, `supports link ${edge.from} ${edge.relation} ${edge.to}${edge.detail ? ` (${edge.detail})` : ""}`);
    if (e.type === "experiment_result") state.experiments.push(e.result as ExperimentResult);
  }
  return {
    world: start.change.world_id,
    title: start.change.title,
    diff: start.change.diff,
    verdict: verdict.verdict,
    judgeReasons: [],
    finish: {
      headline: verdict.headline,
      prediction: summary.model_prediction ?? "unsure",
      cause_claim: summary.cause_claim,
      evidence: [],
      supported_hypothesis_ids: [],
      limitations: [],
      ...(verdict.mitigation ? { mitigation: verdict.mitigation } : {}),
    },
    state,
  };
}

// ── planted errors (deterministic, one per variant) ──────────────────────────
const evidenceNumbers = (c: Case) => {
  const text = [...c.state.rowFacts.values(), ...c.state.experiments.map((x) => JSON.stringify(x.observations))].join(" ");
  return new Set(text.match(/\b\d{2,}\b/g) ?? []);
};

function wrongNumber(c: Case): FinishArgs | null {
  // Only real quantities (not ids like rule-0291 or ag-0010) that the evidence actually contains.
  const known = evidenceNumbers(c);
  const claim = c.finish.cause_claim ?? "";
  const target = quantities(claim).map(String).find((n) => known.has(n));
  if (!target) return null;
  const altered = String(Math.round(Number(target) * 1.25) + 3);
  return { ...c.finish, cause_claim: claim.replace(new RegExp(`(?<![\\w-])${target}(?![\\w-])`), altered) };
}

const INVENTED = [
  "In addition, the change exhausts memory on the meta-store host, which is what ultimately triggers the failure.",
  "It also forces the downstream service to restart every five minutes, doubling its CPU load.",
  "The change additionally removes the read replica, so every query falls back to the primary database.",
];
function inventedClaim(c: Case, i: number): FinishArgs {
  return { ...c.finish, cause_claim: `${c.finish.cause_claim} ${INVENTED[i % INVENTED.length]}` };
}

function badMitigation(c: Case): FinishArgs | null {
  if (c.verdict !== "reproduced_failure" || !c.finish.mitigation) return null;
  // Propose a fix that keeps the failing condition: lower a limit / keep the change as is.
  return { ...c.finish, mitigation: "Lower the consumer's limit by half and keep the change exactly as proposed; that will stop the failure." };
}

function contradictedVerdict(c: Case): FinishArgs {
  return c.verdict === "reproduced_failure"
    ? { ...c.finish, prediction: "safe", headline: "The change is safe", cause_claim: "The change is safe: every consumer keeps working, and the experiments show no difference between baseline and candidate." }
    : { ...c.finish, prediction: "breaks", headline: "The change breaks the consumer", cause_claim: "The change breaks the downstream consumer: the candidate run fails while the baseline passes.", mitigation: "Revert the change." };
}

// ── run ───────────────────────────────────────────────────────────────────────
const runDirs = readdirSync(values.runs!)
  .filter((d) => d.startsWith("full-"))
  .flatMap((d) => readdirSync(join(values.runs!, d)).filter((r) => r.startsWith("run-")).map((r) => join(values.runs!, d, r)));
const byWorld = new Map<string, Case>();
for (const dir of runDirs) {
  const c = loadCase(dir);
  if (c && !byWorld.has(c.world)) byWorld.set(c.world, c);
}
const cases = [...byWorld.values()].slice(0, Number(values.limit));

const outDir = join("runs", "reviewer-eval", new Date().toISOString().replace(/[-:]/g, "").slice(0, 13));
mkdirSync(outDir, { recursive: true });
const client = new NightshiftClient({ receiptLog: new ReceiptLog(join(outDir, "receipts.jsonl")) });

type Job = { world: string; kind: string; expectApproved: boolean; finish: FinishArgs; c: Case };
const jobs: Job[] = [];
cases.forEach((c, i) => {
  jobs.push({ world: c.world, kind: "clean", expectApproved: true, finish: c.finish, c });
  const n = wrongNumber(c);
  if (n) jobs.push({ world: c.world, kind: "wrong_number", expectApproved: false, finish: n, c });
  jobs.push({ world: c.world, kind: "invented_claim", expectApproved: false, finish: inventedClaim(c, i), c });
  const m = badMitigation(c);
  if (m) jobs.push({ world: c.world, kind: "bad_mitigation", expectApproved: false, finish: m, c });
  jobs.push({ world: c.world, kind: "contradicted_verdict", expectApproved: false, finish: contradictedVerdict(c), c });
});
console.log(`${cases.length} real investigations → ${jobs.length} reviews by ${REVIEWER_MODEL} · ${outDir}\n`);

const results: any[] = [];
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const job = jobs[next++]!;
    const t = Date.now();
    try {
      const review = await reviewExplanation(client, REVIEWER_MODEL, { changeTitle: job.c.title, diff: job.c.diff, verdict: job.c.verdict, judgeReasons: job.c.judgeReasons, finish: job.finish, state: job.c.state });
      const correct = review.approved === job.expectApproved;
      results.push({ world: job.world, kind: job.kind, approved: review.approved, correct, issues: review.issues, reviewer: review.reviewerModel, ms: Date.now() - t });
      console.log(`${job.world} ${job.kind.padEnd(21)} ${review.approved ? "approved" : "flagged "} ${correct ? "✓" : "✗"}`);
    } catch (err) {
      results.push({ world: job.world, kind: job.kind, error: (err as Error).message, ms: Date.now() - t });
      console.log(`${job.world} ${job.kind.padEnd(21)} ERROR ${(err as Error).message.slice(0, 100)}`);
    }
    writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
  }
}
await Promise.all([worker(), worker()]); // ≤ 2 concurrent calls (Nightshift guidance)

const kinds = ["clean", "wrong_number", "invented_claim", "bad_mitigation", "contradicted_verdict"];
const lines = ["| Version | Reviewed | Reviewer correct | Rate |", "|---|---|---|---|"];
for (const k of kinds) {
  const rs = results.filter((r) => r.kind === k && !r.error);
  const ok = rs.filter((r) => r.correct).length;
  const label = k === "clean" ? "clean (should approve)" : `${k.replace(/_/g, " ")} (should flag)`;
  lines.push(`| ${label} | ${rs.length} | ${ok} | ${rs.length ? Math.round((100 * ok) / rs.length) : 0}% |`);
}
const planted = results.filter((r) => r.kind !== "clean" && !r.error);
const errors = results.filter((r) => r.error).length;
lines.push(`\nPlanted errors caught: ${planted.filter((r) => r.correct).length}/${planted.length} · reviewer unavailable: ${errors} · reviewer ${REVIEWER_MODEL}`);
writeFileSync(join(outDir, "summary.md"), `${lines.join("\n")}\n`);
console.log(`\n${lines.join("\n")}\n\nSaved ${outDir}`);

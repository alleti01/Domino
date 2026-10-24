// Run Domino on every world the data layer offers (or a given list) and collect the results
// in one folder for Anish's scorecard. Never reads ground truth.
//   npx tsx scripts/run-worlds.ts --repo ../../team-repo-anish [--worlds w-a,w-b] [--mode full]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { RunMode } from "../../contracts/agent/types.js";
import { DataLayerEvidence, DataLayerWorlds } from "../src/adapters/practice.js";
import { DEFAULT_CRITIC, INVESTIGATOR_MODEL, investigate } from "../src/agent.js";
import { writeBundle } from "../src/bundle.js";
import { NightshiftClient, nightshiftHealth } from "../src/llm/nightshift.js";
import { ReceiptLog } from "../src/llm/receipts.js";
import { Recorder } from "../src/replay.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: "../../team-repo-anish" },
    module: { type: "string", default: "data_layer" },
    worlds: { type: "string" },
    mode: { type: "string", default: "full" },
    out: { type: "string", default: "runs/worlds" },
    "no-critic": { type: "boolean", default: false },
  },
});

const worlds = values.worlds
  ? values.worlds.split(",")
  : (JSON.parse(execFileSync("python3", ["-m", values.module!, "worlds"], { cwd: values.repo!, encoding: "utf8" })).worlds as string[]);
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
const outDir = join(values.out!, `${values.mode}-${stamp}`);
mkdirSync(outDir, { recursive: true });
const dataOpts = { repoDir: values.repo!, module: values.module! };
const critic = values["no-critic"] ? undefined : DEFAULT_CRITIC;

console.log(`${worlds.length} worlds · mode ${values.mode} · output ${outDir}\n`);
const rows: any[] = [];
/** Wait until Nightshift answers and can reach NVIDIA (a real one-word Nemotron call), up to maxMs. */
async function waitForModel(client: NightshiftClient, maxMs = 5 * 60_000): Promise<boolean> {
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    const health = await nightshiftHealth(client);
    if (health.ok) {
      try {
        await client.chat({ purpose: "preflight", messages: [{ role: "user", content: "Reply with: ok" }] });
        return true;
      } catch {
        /* NVIDIA unreachable: wait and retry */
      }
    }
    await new Promise((r) => setTimeout(r, 20_000));
  }
  return false;
}

const attempts = new Map<string, number>();
const queue = [...worlds];
while (queue.length) {
  const world = queue.shift()!;
  attempts.set(world, (attempts.get(world) ?? 0) + 1);
  process.stdout.write(`${world.padEnd(8)} … `);
  const client = new NightshiftClient({ receiptLog: new ReceiptLog(join(outDir, "receipts.jsonl")) });
  if (!(await waitForModel(new NightshiftClient()))) {
    console.log("model service unreachable for 5 min; skipping (outage)");
    rows.push({ world, verdict: "inconclusive", outage: true, error: "model service unreachable before start" });
    continue;
  }
  const recorder = new Recorder(world, values.mode!, values.module!, { investigator_model: INVESTIGATOR_MODEL, ...(critic ? { critic } : {}) });
  try {
    const summary = await investigate({
      changeId: world,
      mode: values.mode as RunMode,
      outDir,
      healthCheck: () => nightshiftHealth(client),
      investigatorModel: INVESTIGATOR_MODEL,
      ...(critic ? { critic } : {}),
      model: recorder.model(client),
      evidence: recorder.evidence(new DataLayerEvidence(dataOpts)),
      worlds: recorder.worlds(new DataLayerWorlds(dataOpts)),
    });
    const runDir = join(outDir, summary.run_id);
    await recorder.save(join(runDir, "cassette.json"), summary);
    const bundle = await writeBundle(runDir, summary.cause_claim);
    const row = {
      world,
      verdict: summary.verdict,
      prediction: summary.model_prediction,
      review: bundle.review.final,
      experiments: summary.experiments,
      calls: summary.model_calls,
      secs: Math.round(summary.duration_ms / 1000),
      outage: summary.outage,
      nemotron: summary.all_calls_nemotron,
      headline: bundle.verdict.headline,
      cause: summary.cause_claim,
      run_id: summary.run_id,
    };
    if (row.outage && (attempts.get(world) ?? 0) < 2) {
      console.log(`outage after ${row.secs}s; will retry once`);
      queue.push(world);
      continue;
    }
    rows.push(row);
    console.log(`${row.verdict.padEnd(20)} review ${String(row.review).padEnd(11)} ${row.experiments} exps · ${row.calls} calls · ${row.secs}s${row.outage ? " · OUTAGE" : ""}`);
  } catch (err) {
    rows.push({ world, verdict: "error", error: (err as Error).message });
    console.log(`ERROR ${(err as Error).message.slice(0, 160)}`);
  }
  writeFileSync(join(outDir, "results.json"), JSON.stringify(rows, null, 2));
}

const count = (v: string) => rows.filter((r) => r.verdict === v).length;
console.log(
  `\nreproduced_failure ${count("reproduced_failure")} · no_failure_observed ${count("no_failure_observed")} · inconclusive ${count("inconclusive")} · errors ${count("error")}` +
    ` · outages ${rows.filter((r) => r.outage).length} · all-Nemotron ${rows.filter((r) => r.nemotron).length}/${rows.length}`,
);
console.log(`Results: ${join(outDir, "results.json")} (ungraded: ground truth lives only in Anish's private folder)`);

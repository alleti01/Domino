// domino investigate --change <world-id> [--mode full|no_tools|no_experiments|no_usl] [--data practice|data_layer]
//                    [--repo <team-repo>] [--out runs] [--memory <dir>] [--stub]
// domino replay <cassette.json> [--out runs/replay]      (no keys, no Nightshift, no data layer)
// domino demo [--out runs/replay]                         (replays every recording in demo/)
//
// Every live investigation saves runs/<run_id>/cassette.json, a recording that `replay` re-runs
// through the same agent code. --memory persists the Meterless World Model across runs
// (keep it off for scorecard runs).

import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { RunMode, RunSummary, TraceEvent } from "../../contracts/agent/types.js";
import { DataLayerEvidence, DataLayerWorlds } from "./adapters/practice.js";
import { investigate } from "./agent.js";
import { StubEvidence, StubWorlds } from "./fakes/stubWorld.js";
import { NightshiftClient, nightshiftHealth } from "./llm/nightshift.js";
import { ReceiptLog } from "./llm/receipts.js";
import { renderTrace } from "./render.js";
import { Player, Recorder } from "./replay.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    change: { type: "string" },
    mode: { type: "string", default: "full" },
    out: { type: "string" },
    stub: { type: "boolean", default: false },
    memory: { type: "string" },
    data: { type: "string" },
    repo: { type: "string", default: ".." },
    quiet: { type: "boolean", default: false },
  },
});

const USAGE = `usage:
  domino investigate --change <world-id> [--mode full|no_tools|no_experiments|no_usl] [--data practice|data_layer] [--repo ..] [--out runs] [--memory <dir>] [--stub]
  domino replay <cassette.json> [--out runs/replay]
  domino demo [--out runs/replay]`;

const readTrace = async (dir: string) =>
  (await readFile(join(dir, "trace.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l) as TraceEvent);

async function runLive(): Promise<void> {
  if (!values.change) throw new Error(USAGE);
  const modes: RunMode[] = ["full", "no_tools", "no_experiments", "no_usl"];
  if (!modes.includes(values.mode as RunMode)) throw new Error(`--mode must be one of ${modes.join(", ")}`);
  const source = values.stub ? "stub" : (values.data ?? "practice");
  if (!["stub", "practice", "data_layer"].includes(source)) throw new Error("--data must be practice or data_layer (or pass --stub)");
  const outDir = values.out ?? "runs";
  const dataOpts = { repoDir: values.repo!, module: source };

  const recorder = new Recorder(values.change, values.mode!, source);
  const client = new NightshiftClient({ receiptLog: new ReceiptLog(join(outDir, "receipts.jsonl")) });
  const summary = await investigate({
    healthCheck: () => nightshiftHealth(client),
    changeId: values.change,
    mode: values.mode as RunMode,
    outDir,
    model: recorder.model(client),
    evidence: recorder.evidence(source === "stub" ? new StubEvidence() : new DataLayerEvidence(dataOpts)),
    worlds: recorder.worlds(source === "stub" ? new StubWorlds() : new DataLayerWorlds(dataOpts)),
    ...(values.memory ? { memoryDir: values.memory } : {}),
  });
  await recorder.save(join(outDir, summary.run_id, "cassette.json"), summary);
  if (!values.quiet) console.log(renderTrace(await readTrace(join(outDir, summary.run_id))));
  console.log(`\n${JSON.stringify(summary, null, 2)}\nRecording: ${join(outDir, summary.run_id, "cassette.json")}`);
}

async function replayOne(cassettePath: string, outDir: string): Promise<{ recorded: RunSummary | undefined; replayed: RunSummary }> {
  const player = await Player.load(cassettePath);
  const { cassette } = player;
  const replayed = await investigate({
    changeId: cassette.change_id,
    mode: cassette.mode as RunMode,
    outDir,
    model: player.model(),
    evidence: player.evidence(),
    worlds: player.worlds(),
    replay: true,
  });
  if (!values.quiet) console.log(renderTrace(await readTrace(join(outDir, replayed.run_id))));
  const recorded = cassette.summary;
  const same = recorded?.verdict === replayed.verdict;
  console.log(
    `\nRecorded ${cassette.recorded_at} on ${cassette.data_source}: verdict ${recorded?.verdict ?? "?"} · replayed: ${replayed.verdict} ${same ? "✓ identical" : "✗ DIFFERENT"}` +
      `\nReplay trace (replay: true on every event): ${join(outDir, replayed.run_id, "trace.jsonl")}`,
  );
  if (!same) process.exitCode = 1;
  return { recorded, replayed };
}

async function main(): Promise<void> {
  const command = positionals[0];
  if (command === "investigate") return runLive();
  if (command === "replay") {
    if (!positionals[1]) throw new Error(USAGE);
    await replayOne(positionals[1], values.out ?? "runs/replay");
    return;
  }
  if (command === "demo") {
    const dir = "demo";
    const cassettes = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".cassette.json")).sort() : [];
    if (!cassettes.length) throw new Error("No recordings in demo/");
    const results = [];
    for (const file of cassettes) {
      console.log(`\n════════ ${file} ════════\n`);
      results.push({ file, ...(await replayOne(join(dir, file), values.out ?? "runs/replay")) });
    }
    console.log("\n════════ summary ════════");
    for (const r of results) console.log(`${r.file.padEnd(40)} ${r.replayed.verdict.padEnd(20)} ${r.recorded?.verdict === r.replayed.verdict ? "matches recording" : "DIFFERS from recording"}`);
    return;
  }
  throw new Error(USAGE);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});

// The domino command (bin/domino.mjs). Install once with `npm link` in agent/, then run from anywhere:
//
//   domino doctor                                   is this machine ready for live checks?
//   domino run --change <world-id> [--mode full|no_tools|no_experiments|no_usl] [--fail-on-break]
//   domino dashboard [--port 5173] [--open]         the dashboard, watching the runs folder
//   domino pr <number> --repo owner/name [--post]   check one pull request
//   domino watch --repo owner/name [--post]         check every new commit on every open pull request
//   domino replay <cassette.json>                   re-run a recording (no keys, no Nightshift, no data layer)
//   domino demo                                     replay every recording in demo/
//   domino report <run_dir>                         rebuild bundle.json and report.md for a run
//
// Settings come from flags, then .env (current folder, then agent/): DOMINO_DATA_REPO is the checkout
// with the data layer, DOMINO_RUNS_DIR the runs folder (default agent/runs/live). Every live run saves
// <runs>/<run_id>/cassette.json, a recording that `replay` re-runs through the same agent code.
// --memory persists the Meterless World Model across runs (keep it off for scorecard runs).

import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { RunMode, RunSummary, TraceEvent } from "../../contracts/agent/types.js";
import { investigate } from "./agent.js";
import { AGENT_DIR, EXIT, dataRepo, exitCodeFor, loadEnv, runsDir } from "./config.js";
import { dashboard } from "./dashboard.js";
import { doctor, printChecks } from "./doctor.js";
import { writeBundle } from "./bundle.js";
import { renderTrace } from "./render.js";
import { Player } from "./replay.js";
import { type DataSource, MODES, runInvestigation } from "./runner.js";
import { checkPr, watch } from "./watch.js";

loadEnv();

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    change: { type: "string" },
    mode: { type: "string", default: "full" },
    out: { type: "string" },
    stub: { type: "boolean", default: false },
    memory: { type: "string" },
    data: { type: "string" },
    repo: { type: "string" },
    "data-repo": { type: "string" },
    quiet: { type: "boolean", default: false },
    "no-critic": { type: "boolean", default: false },
    "fail-on-break": { type: "boolean", default: false },
    port: { type: "string", default: "5173" },
    open: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
    post: { type: "boolean", default: false },
    interval: { type: "string", default: "60" },
    once: { type: "boolean", default: false },
    "include-drafts": { type: "boolean", default: false },
    "include-forks": { type: "boolean", default: false },
  },
});

const USAGE = `usage:
  domino doctor [--data-repo <team repo>]
  domino run --change <world-id> [--mode full|no_tools|no_experiments|no_usl] [--fail-on-break] [--data-repo <team repo>] [--out <runs>] [--memory <dir>] [--no-critic] [--quiet] [--stub]
  domino dashboard [--port 5173] [--open] [--out <runs>]
  domino pr <number> --repo owner/name [--post] [--mode full] [--fail-on-break]
  domino watch --repo owner/name [--post] [--interval 60] [--once] [--include-drafts] [--include-forks]
  domino replay <cassette.json> [--out <runs>/replay]
  domino demo [--out <runs>/replay]
  domino report <run_dir>

exit codes: 0 finished · 1 failure reproduced (with --fail-on-break) · 2 error · 3 outage or inconclusive`;

const readTrace = async (dir: string) =>
  (await readFile(join(dir, "trace.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l) as TraceEvent);

async function runLive(): Promise<number> {
  if (!values.change) throw new Error(USAGE);
  if (!MODES.includes(values.mode as RunMode)) throw new Error(`--mode must be one of ${MODES.join(", ")}`);
  const data = (values.stub ? "stub" : (values.data ?? "data_layer")) as DataSource;
  if (!["stub", "practice", "data_layer"].includes(data)) throw new Error("--data must be data_layer or practice (or pass --stub)");
  const outDir = runsDir(values.out);
  const { summary, runDir } = await runInvestigation({
    changeId: values.change,
    mode: values.mode as RunMode,
    outDir,
    data,
    repoDir: data === "stub" ? AGENT_DIR : dataRepo(values["data-repo"]),
    critic: !values["no-critic"],
    ...(values.memory ? { memoryDir: values.memory } : {}),
  });
  if (!values.quiet) console.log(renderTrace(await readTrace(runDir)));
  console.log(`\n${JSON.stringify(summary, null, 2)}\nReport: ${join(runDir, "report.md")}\nRecording: ${join(runDir, "cassette.json")}`);
  return exitCodeFor(summary, values["fail-on-break"]!);
}

async function replayOne(cassettePath: string, outDir: string): Promise<{ recorded: RunSummary | undefined; replayed: RunSummary; matches: boolean }> {
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
    ...(cassette.settings?.investigator_model ? { investigatorModel: cassette.settings.investigator_model } : {}),
    ...(cassette.settings?.critic ? { critic: cassette.settings.critic } : {}),
  });
  await writeBundle(join(outDir, replayed.run_id), replayed.cause_claim);
  if (!values.quiet) console.log(renderTrace(await readTrace(join(outDir, replayed.run_id))));
  const recorded = cassette.summary;
  const same = recorded?.verdict === replayed.verdict && !player.exhausted && !replayed.outage && player.unusedModelResponses() === 0;
  if (player.exhausted || player.unusedModelResponses() !== 0) console.log("\n✗ The agent no longer follows this recording step for step: re-record it with `domino run`.");
  console.log(
    `\nRecorded ${cassette.recorded_at} on ${cassette.data_source}: verdict ${recorded?.verdict ?? "?"} · replayed: ${replayed.verdict} ${same ? "✓ identical" : "✗ DIFFERENT"}` +
      `\nReplay trace (replay: true on every event): ${join(outDir, replayed.run_id, "trace.jsonl")}`,
  );
  return { recorded, replayed, matches: same };
}

// Replays go to their own folder so the dashboard never lists them among live runs.
const replayDir = () => values.out ?? join(runsDir(), "..", "replay");

async function main(): Promise<number> {
  const command = positionals[0];
  if (!command || values.help || command === "help") {
    console.log(USAGE);
    return command || values.help ? EXIT.ok : EXIT.error;
  }
  if (command === "run" || command === "investigate") return runLive();
  if (command === "doctor") {
    const checks = await doctor(dataRepo(values["data-repo"]));
    printChecks(checks);
    return checks.some((c) => c.status === "fail") ? EXIT.error : EXIT.ok;
  }
  if (command === "pr" || command === "watch") {
    const repo = values.repo;
    if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`--repo owner/name is required\n${USAGE}`);
    if (!MODES.includes(values.mode as RunMode)) throw new Error(`--mode must be one of ${MODES.join(", ")}`);
    const o = { repo, mode: values.mode as RunMode, outDir: runsDir(values.out), repoDir: dataRepo(values["data-repo"]), post: values.post!, critic: !values["no-critic"] };
    if (command === "watch") {
      await watch({ ...o, intervalS: Math.max(15, Number(values.interval)), once: values.once!, drafts: values["include-drafts"]!, forks: values["include-forks"]! });
      return EXIT.ok;
    }
    const number = Number(positionals[1]);
    if (!Number.isInteger(number) || number < 1) throw new Error("usage: domino pr <number> --repo owner/name [--post]");
    const { results, comment } = await checkPr(number, o);
    if (!values.post) console.log(`\n${comment}\n(dry run: pass --post to publish this comment and a domino/check status)`);
    const codes = results.map((r) => (r.summary ? exitCodeFor(r.summary, values["fail-on-break"]!) : EXIT.error));
    return codes.includes(EXIT.reproduced) ? EXIT.reproduced : Math.max(EXIT.ok, ...codes);
  }
  if (command === "dashboard") return dashboard({ runsDir: runsDir(values.out), port: Number(values.port), open: values.open! });
  if (command === "replay") {
    if (!positionals[1]) throw new Error(USAGE);
    return (await replayOne(positionals[1], replayDir())).matches ? EXIT.ok : EXIT.reproduced;
  }
  if (command === "report") {
    const runDir = positionals[1];
    if (!runDir) throw new Error("usage: domino report <run_dir>");
    const summary = JSON.parse(await readFile(join(runDir, "summary.json"), "utf8")) as RunSummary;
    await writeBundle(runDir, summary.cause_claim);
    console.log(await readFile(join(runDir, "report.md"), "utf8"));
    return EXIT.ok;
  }
  if (command === "demo") {
    const dir = join(AGENT_DIR, "demo");
    const cassettes = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".cassette.json")).sort() : [];
    if (!cassettes.length) throw new Error("No recordings in demo/");
    const results = [];
    for (const file of cassettes) {
      console.log(`\n════════ ${file} ════════\n`);
      results.push({ file, ...(await replayOne(join(dir, file), replayDir())) });
    }
    console.log("\n════════ summary ════════");
    for (const r of results) console.log(`${r.file.padEnd(40)} ${r.replayed.verdict.padEnd(20)} ${r.matches ? "matches recording" : "OUT OF DATE: re-record"}`);
    return results.every((r) => r.matches) ? EXIT.ok : EXIT.reproduced;
  }
  throw new Error(`Unknown command "${command}".\n${USAGE}`);
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = EXIT.error;
  },
);

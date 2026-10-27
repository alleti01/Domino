// Where the domino command finds its settings, the data layer and its runs folder, from any directory.
//   .env           read from the current directory, then from agent/ (shell variables always win)
//   data layer     --data-repo, else DOMINO_DATA_REPO, else the repo this agent lives in
//   runs folder    --out, else DOMINO_RUNS_DIR, else agent/runs/live (flat run-* folders the dashboard reads)

import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunSummary } from "../../contracts/agent/types.js";

export const AGENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const UI_DIR = resolve(AGENT_DIR, "..", "ui");

export function loadEnv(cwd = process.cwd()): void {
  const files = [...new Set([join(cwd, ".env"), join(AGENT_DIR, ".env")])];
  for (const file of files) if (existsSync(file)) process.loadEnvFile(file);
}

/** A path from a flag is relative to where the command runs; one from .env is relative to agent/. */
const fromFlag = (p: string, cwd: string) => (isAbsolute(p) ? p : resolve(cwd, p));
const fromEnv = (p: string) => (isAbsolute(p) ? p : resolve(AGENT_DIR, p));

export function dataRepo(flag?: string, cwd = process.cwd(), env = process.env): string {
  const dir = flag ? fromFlag(flag, cwd) : env.DOMINO_DATA_REPO ? fromEnv(env.DOMINO_DATA_REPO) : resolve(AGENT_DIR, "..");
  if (!existsSync(join(dir, "data_layer"))) throw new Error(`No data_layer/ in ${dir}. Pass --data-repo <team repo> or set DOMINO_DATA_REPO.`);
  return dir;
}

export function runsDir(flag?: string, cwd = process.cwd(), env = process.env): string {
  if (flag) return fromFlag(flag, cwd);
  if (env.DOMINO_RUNS_DIR) return fromEnv(env.DOMINO_RUNS_DIR);
  return join(AGENT_DIR, "runs", "live");
}

/** Exit codes a CI step can act on: 0 finished, 1 failure reproduced (only when asked), 2 error, 3 outage or inconclusive. */
export const EXIT = { ok: 0, reproduced: 1, error: 2, outage: 3 } as const;

export function exitCodeFor(summary: Pick<RunSummary, "verdict" | "outage">, failOnBreak: boolean): number {
  if (summary.outage || summary.verdict === "inconclusive") return EXIT.outage;
  if (failOnBreak && summary.verdict === "reproduced_failure") return EXIT.reproduced;
  return EXIT.ok;
}

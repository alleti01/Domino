// `domino pr` checks one pull request; `domino watch` checks every new commit on every open PR.
// Both run on the machine that has Nightshift and Zetaris, and only talk to GitHub through `gh`:
// no inbound ports, and PR code is never checked out or run. Without --post nothing reaches GitHub;
// the comment that would have been posted is written next to the runs instead.

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunMode } from "../../contracts/agent/types.js";
import type { WorldsAdapter } from "./adapters.js";
import { DataLayerWorlds } from "./adapters/practice.js";
import { NightshiftClient, nightshiftHealth } from "./llm/nightshift.js";
import { type CheckResult, type MatchResult, fetchPr, fetchSystems, gh, matchPr, postComment, readReport, renderPrComment, setStatus, sourceFor, statusFor } from "./pr.js";
import { runInvestigation } from "./runner.js";

export interface PrOptions {
  repo: string;
  mode: RunMode;
  outDir: string;
  repoDir: string;
  post: boolean;
  critic: boolean;
  log?: (line: string) => void;
}

/** Wait until Nightshift answers and can reach NVIDIA (a real one-word Nemotron call), up to maxMs. */
export async function waitForModel(maxMs = 5 * 60_000): Promise<boolean> {
  const client = new NightshiftClient();
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    if ((await nightshiftHealth(client)).ok) {
      try {
        await client.chat({ purpose: "preflight", messages: [{ role: "user", content: `Reply with: ok (${Date.now()})` }] });
        return true;
      } catch {
        /* NVIDIA unreachable: wait and retry */
      }
    }
    await new Promise((r) => setTimeout(r, 20_000));
  }
  return false;
}

export async function checkPr(number: number, o: PrOptions): Promise<{ match: MatchResult; results: CheckResult[]; comment: string; commentUrl: string | null }> {
  const log = o.log ?? console.log;
  const pr = await fetchPr(o.repo, number);
  const worlds = new DataLayerWorlds({ repoDir: o.repoDir, module: "data_layer" });
  const systems = await fetchSystems(o.repo, pr.baseRef);
  const match = await matchPr(pr.diff, systems, async (world) => (await worlds.describe(world)).change);
  log(`PR #${number} @ ${pr.headSha.slice(0, 7)}: ${match.matched.length} modelled change(s), ${match.notCovered.length} file(s) not covered`);

  if (o.post) {
    await setStatus(o.repo, pr.headSha, "pending", match.matched.length ? `Checking ${match.matched.map((m) => m.folder).join(", ")}` : "Not covered");
    if (match.matched.length) await postComment(o.repo, number, renderPrComment(pr, match, "running"));
  }

  const results: CheckResult[] = [];
  for (const m of match.matched) {
    const source = sourceFor(pr, m.folder);
    const wrapWorlds = (inner: WorldsAdapter): WorldsAdapter => ({
      getChange: async (id) => ({ ...(await inner.getChange(id)), source }),
      catalog: (id) => inner.catalog(id),
      run: (req) => inner.run(req),
    });
    let result: CheckResult = { folder: m.folder, error: "not run" };
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (!(await waitForModel())) {
        result = { folder: m.folder, error: "The model service was unreachable for 5 minutes, so the check could not start. This says nothing about the change." };
        break;
      }
      try {
        log(`  ${m.folder} → ${m.world}: investigating (${o.mode})`);
        const { summary, runDir } = await runInvestigation({ changeId: m.world, mode: o.mode, outDir: o.outDir, data: "data_layer", repoDir: o.repoDir, critic: o.critic, wrapWorlds });
        result = { folder: m.folder, summary, report: await readReport(runDir), bundle: JSON.parse(await readFile(join(runDir, "bundle.json"), "utf8")) };
        log(`  ${m.folder}: ${summary.verdict} (${summary.run_id}, ${Math.round(summary.duration_ms / 1000)}s)`);
        if (!summary.outage || attempt === 2) break;
        log(`  ${m.folder}: model outage during the run; cooling down 2 minutes, then retrying once`);
        await new Promise((r) => setTimeout(r, 120_000));
      } catch (err) {
        result = { folder: m.folder, error: (err as Error).message };
        break;
      }
    }
    results.push(result);
  }

  const comment = renderPrComment(pr, match, results);
  const safeRepo = o.repo.replace(/\//g, "-");
  await mkdir(o.outDir, { recursive: true });
  await writeFile(join(o.outDir, `pr-${safeRepo}-${number}-${pr.headSha.slice(0, 7)}.md`), comment);
  let commentUrl: string | null = null;
  if (o.post) {
    const status = statusFor(match, results);
    if (match.matched.length || match.notCovered.length) commentUrl = await postComment(o.repo, number, comment);
    await setStatus(o.repo, pr.headSha, status.state, status.description);
    log(`  posted: ${status.state} · ${commentUrl}`);
  }
  return { match, results, comment, commentUrl };
}

// ───────────── watch ─────────────

export interface WatchState {
  repo: string;
  updated_at: string;
  current: { number: number; head_sha: string; started_at: string } | null;
  queue: Array<{ number: number; head_sha: string; title: string }>;
  checked: Record<string, { at: string; verdicts: string[]; run_ids: string[]; skipped?: string }>;
}

export interface OpenPr {
  number: number;
  headRefOid: string;
  title: string;
  isDraft: boolean;
  isCrossRepository: boolean;
}

/** PR commits not checked yet, oldest PR first; drafts and forks are skipped unless asked for. */
export function newWork(prs: OpenPr[], state: Pick<WatchState, "checked">, opts: { drafts: boolean; forks: boolean }): { todo: OpenPr[]; skipped: Array<{ pr: OpenPr; why: string }> } {
  const todo: OpenPr[] = [];
  const skipped: Array<{ pr: OpenPr; why: string }> = [];
  for (const pr of [...prs].sort((a, b) => a.number - b.number)) {
    if (state.checked[`${pr.number}@${pr.headRefOid}`]) continue;
    if (pr.isDraft && !opts.drafts) skipped.push({ pr, why: "draft" });
    else if (pr.isCrossRepository && !opts.forks) skipped.push({ pr, why: "from a fork" });
    else todo.push(pr);
  }
  return { todo, skipped };
}

export const statePath = (outDir: string, repo: string) => join(outDir, `watch-${repo.replace(/\//g, "-")}.json`);

export async function watch(o: PrOptions & { intervalS: number; once: boolean; drafts: boolean; forks: boolean }): Promise<void> {
  const file = statePath(o.outDir, o.repo);
  const state: WatchState = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { repo: o.repo, updated_at: "", current: null, queue: [], checked: {} };
  const save = async () => {
    state.updated_at = new Date().toISOString();
    await mkdir(o.outDir, { recursive: true });
    await writeFile(file, `${JSON.stringify(state, null, 2)}\n`);
  };
  console.log(`Watching ${o.repo} every ${o.intervalS}s${o.post ? " (posting to GitHub)" : " (dry run: nothing is posted)"}. State: ${file}`);
  for (;;) {
    let prs: OpenPr[] = [];
    try {
      prs = JSON.parse(await gh(["pr", "list", "--repo", o.repo, "--state", "open", "--json", "number,headRefOid,title,isDraft,isCrossRepository"]));
    } catch (err) {
      console.log(`GitHub unreachable (${(err as Error).message.slice(0, 120)}); trying again next round`);
    }
    const { todo, skipped } = newWork(prs, state, o);
    for (const s of skipped) state.checked[`${s.pr.number}@${s.pr.headRefOid}`] = { at: new Date().toISOString(), verdicts: [], run_ids: [], skipped: s.why };
    state.queue = todo.map((p) => ({ number: p.number, head_sha: p.headRefOid, title: p.title }));
    await save();
    for (const pr of todo) {
      state.current = { number: pr.number, head_sha: pr.headRefOid, started_at: new Date().toISOString() };
      state.queue = state.queue.filter((q) => !(q.number === pr.number && q.head_sha === pr.headRefOid));
      await save();
      try {
        const { results } = await checkPr(pr.number, o);
        state.checked[`${pr.number}@${pr.headRefOid}`] = {
          at: new Date().toISOString(),
          verdicts: results.map((r) => r.summary?.verdict ?? "error"),
          run_ids: results.flatMap((r) => (r.summary ? [r.summary.run_id] : [])),
        };
      } catch (err) {
        console.log(`PR #${pr.number}: ${(err as Error).message}`);
        state.checked[`${pr.number}@${pr.headRefOid}`] = { at: new Date().toISOString(), verdicts: ["error"], run_ids: [], skipped: (err as Error).message.slice(0, 200) };
      }
      state.current = null;
      await save();
    }
    if (o.once) return;
    await new Promise((r) => setTimeout(r, o.intervalS * 1000));
  }
}

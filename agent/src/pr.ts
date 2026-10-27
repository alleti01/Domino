// Pull requests: read one with `gh`, match it to a change Domino has a model of, investigate, and
// report back as one comment (edited in place) plus a `domino/check` commit status.
//
// Domino can only run experiments on a change that has a world behind it. The repo's domino.json (read
// from the base branch, so a PR cannot remap itself) says which system each folder deploys to:
//   {"systems": {"orders-a/": "w-c5h2"}}
// A PR folder matches when its files and changed lines equal the change modelled for that system. Anything
// else is reported as not covered, with no verdict: the experiment always runs the modelled change, so a
// verdict is never lent to different code. PR code is never checked out or executed; only the diff is read.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ChangeSource, EvidenceBundle, RunMode, RunSummary } from "../../contracts/agent/types.js";

const exec = promisify(execFile);

export interface PullRequest {
  repo: string;
  number: number;
  url: string;
  title: string;
  headSha: string;
  baseRef: string;
  isDraft: boolean;
  isFork: boolean;
  diff: string;
}

export async function gh(args: string[], timeout = 60_000): Promise<string> {
  try {
    const { stdout } = await exec("gh", args, { timeout, maxBuffer: 20 * 1024 * 1024 });
    return stdout;
  } catch (err: any) {
    throw new Error(`gh ${args.slice(0, 3).join(" ")} failed: ${String(err?.stderr || err?.message || err).trim().slice(0, 300)}`);
  }
}

/** gh api with a JSON body (written to a temp file, so bodies of any size and content are safe). */
async function ghApi(method: string, path: string, body: unknown): Promise<any> {
  const dir = await mkdtemp(join(tmpdir(), "domino-gh-"));
  try {
    const file = join(dir, "body.json");
    await writeFile(file, JSON.stringify(body));
    const out = await gh(["api", "--method", method, path, "--input", file]);
    return out.trim() ? JSON.parse(out) : null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function fetchPr(repo: string, number: number): Promise<PullRequest> {
  const v = JSON.parse(await gh(["pr", "view", String(number), "--repo", repo, "--json", "number,url,title,headRefOid,baseRefName,isDraft,isCrossRepository"]));
  const diff = await gh(["pr", "diff", String(number), "--repo", repo]);
  return { repo, number: v.number, url: v.url, title: v.title, headSha: v.headRefOid, baseRef: v.baseRefName, isDraft: Boolean(v.isDraft), isFork: Boolean(v.isCrossRepository), diff };
}

/** domino.json from the base branch; null when the repo has none. */
export async function fetchSystems(repo: string, ref: string): Promise<Record<string, string> | null> {
  let raw: string;
  try {
    raw = await gh(["api", `repos/${repo}/contents/domino.json?ref=${encodeURIComponent(ref)}`, "--jq", ".content"]);
  } catch (err) {
    if (/404|Not Found/i.test((err as Error).message)) return null;
    throw err;
  }
  const parsed = JSON.parse(Buffer.from(raw.trim(), "base64").toString("utf8"));
  return parseSystems(parsed);
}

export function parseSystems(config: unknown): Record<string, string> {
  const systems = (config as any)?.systems;
  if (!systems || typeof systems !== "object") throw new Error('domino.json needs {"systems": {"<folder>/": "<system id>"}}');
  return Object.fromEntries(Object.entries(systems).map(([folder, id]) => [folder.endsWith("/") || folder === "" ? folder : `${folder}/`, String(id)]));
}

// ───────────── matching ─────────────

export interface FileChange {
  path: string;
  added: string[];
  removed: string[];
}

/** Files in a unified diff with their changed lines, whitespace-trimmed and blank lines dropped. */
export function splitDiff(diff: string): FileChange[] {
  const files: FileChange[] = [];
  let oldPath: string | null = null;
  let current: FileChange | null = null;
  const strip = (p: string) => p.trim().replace(/^[ab]\//, "").replace(/\t.*$/, "");
  for (const line of diff.split("\n")) {
    if (line.startsWith("--- ")) {
      oldPath = strip(line.slice(4));
      continue;
    }
    if (line.startsWith("+++ ")) {
      const newPath = strip(line.slice(4));
      current = { path: newPath === "/dev/null" ? (oldPath ?? newPath) : newPath, added: [], removed: [] };
      files.push(current);
      continue;
    }
    if (!current || line.startsWith("diff --git") || line.startsWith("@@") || line.startsWith("\\")) continue;
    const text = line.slice(1).trim();
    if (!text) continue;
    if (line.startsWith("+")) current.added.push(text);
    else if (line.startsWith("-")) current.removed.push(text);
  }
  return files;
}

const sameLines = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

export interface ModelledChange {
  entity_id: string;
  files: string[];
  diff: string;
}
export interface MatchResult {
  matched: Array<{ folder: string; world: string; changeId: string; files: string[] }>;
  notCovered: Array<{ path: string; reason: string }>;
}

export async function matchPr(diff: string, systems: Record<string, string> | null, describe: (world: string) => Promise<ModelledChange>): Promise<MatchResult> {
  const changes = splitDiff(diff);
  const result: MatchResult = { matched: [], notCovered: [] };
  if (!systems) {
    result.notCovered.push(...changes.map((c) => ({ path: c.path, reason: "this repository has no domino.json, so no folder is mapped to a modelled system" })));
    return result;
  }
  const folders = Object.keys(systems).sort((a, b) => b.length - a.length);
  const groups = new Map<string, FileChange[]>();
  for (const c of changes) {
    const folder = folders.find((f) => c.path.startsWith(f));
    if (folder === undefined) result.notCovered.push({ path: c.path, reason: "no system in domino.json deploys this folder" });
    else groups.set(folder, [...(groups.get(folder) ?? []), { ...c, path: c.path.slice(folder.length) }]);
  }
  for (const [folder, prFiles] of groups) {
    const world = systems[folder]!;
    let modelled: FileChange[];
    let changeId: string;
    try {
      const m = await describe(world);
      modelled = splitDiff(m.diff);
      changeId = m.entity_id;
    } catch (err) {
      result.notCovered.push(...prFiles.map((f) => ({ path: folder + f.path, reason: `the system mapped to ${folder} could not be read (${(err as Error).message.slice(0, 120)})` })));
      continue;
    }
    const equal =
      modelled.length === prFiles.length &&
      prFiles.every((f) => {
        const m = modelled.find((x) => x.path === f.path);
        return !!m && sameLines(m.added, f.added) && sameLines(m.removed, f.removed);
      });
    if (equal) result.matched.push({ folder, world, changeId, files: prFiles.map((f) => folder + f.path) });
    else result.notCovered.push(...prFiles.map((f) => ({ path: folder + f.path, reason: `differs from the change Domino has modelled for ${folder}, so its experiments would not test this code` })));
  }
  return result;
}

export function sourceFor(pr: PullRequest, folder: string): ChangeSource {
  return { kind: "pull_request", repo: pr.repo, number: pr.number, url: pr.url, title: pr.title, head_sha: pr.headSha, folder };
}

// ───────────── reporting ─────────────

export const MARKER = "<!-- domino:pr-check -->";

export interface CheckResult {
  folder: string;
  summary?: RunSummary;
  bundle?: EvidenceBundle;
  report?: string;
  error?: string;
}

export function renderPrComment(pr: Pick<PullRequest, "headSha">, match: MatchResult, results: CheckResult[] | "running"): string {
  const out = [MARKER, `## Domino pre-deployment check`, `<sub>Commit \`${pr.headSha.slice(0, 7)}\`</sub>`, ""];
  if (results === "running") {
    out.push(
      match.matched.length
        ? `⏳ Checking ${match.matched.map((m) => `\`${m.folder}\``).join(", ")} against Domino's model of ${match.matched.length === 1 ? "that system" : "those systems"}. This usually takes about 3 minutes; this comment will be replaced with the result.`
        : "Nothing in this pull request matches a change Domino has modelled.",
    );
  } else {
    for (const r of results) {
      out.push(r.report ? r.report.trim() : `### ⚪ Domino could not check \`${r.folder}\`\n${r.error ?? "unknown error"}`, "", "---", "");
    }
  }
  if (match.notCovered.length) {
    out.push(`**Not covered** (Domino has no model for these, so they were not checked):`);
    for (const n of match.notCovered) out.push(`- \`${n.path}\`: ${n.reason}`);
  }
  return `${out.join("\n").replace(/\n---\n\n$/, "\n")}\n`;
}

/** The overall commit status for a finished check. GitHub caps descriptions at 140 characters. */
export function statusFor(match: MatchResult, results: CheckResult[]): { state: "success" | "failure" | "error"; description: string } {
  if (!match.matched.length) return { state: "success", description: "Not covered: no change in this PR matches a system Domino has modelled" };
  const broke = results.filter((r) => r.summary?.verdict === "reproduced_failure");
  if (broke.length) return { state: "failure", description: `Failure reproduced in ${broke.map((r) => r.folder).join(", ")}`.slice(0, 140) };
  if (results.some((r) => !r.summary || r.summary.outage || r.summary.verdict === "inconclusive")) return { state: "error", description: "Inconclusive: Domino could not finish the check (see the comment)" };
  return { state: "success", description: "No failure observed under the tested conditions" };
}

/** The id of Domino's existing comment on a PR, if any. */
export function findOwnComment(comments: Array<{ id: number; body?: string }>): number | null {
  return comments.find((c) => c.body?.includes(MARKER))?.id ?? null;
}

export async function postComment(repo: string, number: number, body: string): Promise<string> {
  const comments = JSON.parse(await gh(["api", "--paginate", "--slurp", `repos/${repo}/issues/${number}/comments`])).flat();
  const existing = findOwnComment(comments);
  const res = existing
    ? await ghApi("PATCH", `repos/${repo}/issues/comments/${existing}`, { body })
    : await ghApi("POST", `repos/${repo}/issues/${number}/comments`, { body });
  return res?.html_url ?? "";
}

export async function setStatus(repo: string, sha: string, state: "pending" | "success" | "failure" | "error", description: string): Promise<void> {
  await ghApi("POST", `repos/${repo}/statuses/${sha}`, { state, context: "domino/check", description: description.slice(0, 140) });
}

export async function readReport(runDir: string): Promise<string> {
  return readFile(join(runDir, "report.md"), "utf8");
}

export type { RunMode };

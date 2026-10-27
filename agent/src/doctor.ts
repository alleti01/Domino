// `domino doctor`: is this machine ready to run live checks? Every check prints ok, warn or FAIL with
// what to do about it. Runs one real one-word Nemotron call, so it also proves the model lane works.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { INVESTIGATOR_MODEL } from "./agent.js";
import { NightshiftClient, nightshiftHealth } from "./llm/nightshift.js";

const exec = promisify(execFile);
export type Check = { name: string; status: "ok" | "warn" | "fail"; detail: string };

async function sh(cmd: string, args: string[], cwd?: string, timeout = 60_000): Promise<{ code: number; out: string }> {
  try {
    const { stdout, stderr } = await exec(cmd, args, { cwd, timeout, maxBuffer: 5 * 1024 * 1024 });
    return { code: 0, out: `${stdout}${stderr}` };
  } catch (err: any) {
    return { code: typeof err?.code === "number" ? err.code : 1, out: `${err?.stdout ?? ""}${err?.stderr ?? ""}${err?.message ?? ""}` };
  }
}

/** Reads the data layer's own doctor output; never echoes world ids (they can include held-out worlds). */
export function readDataLayerDoctor(out: string): Check[] {
  const mode = /DOMINO_DATA_MODE:\s*(\w+)/.exec(out)?.[1] ?? "unknown";
  const worlds = /worlds:\s*\[(.*)\]/.exec(out)?.[1];
  const count = worlds === undefined ? 0 : worlds.split(",").filter((w) => w.trim()).length;
  const agentLogin = /zetaris agent login \+ SELECT 1:\s*(ok|FAILED.*)/.exec(out)?.[1] ?? "not reported";
  return [
    { name: "data mode", status: mode === "live" ? "ok" : "warn", detail: mode === "live" ? "live (Zetaris)" : `${mode}: runs will not read live Zetaris data. Point --data-repo or DOMINO_DATA_REPO at a checkout whose .env has DOMINO_DATA_MODE=live.` },
    { name: "Zetaris read-only login", status: agentLogin === "ok" ? "ok" : mode === "live" ? "fail" : "warn", detail: agentLogin === "ok" ? "login and SELECT 1 work" : agentLogin },
    { name: "worlds", status: count ? "ok" : "fail", detail: count ? `${count} available` : "none: the data layer lists no worlds" },
  ];
}

export async function doctor(repoDir: string): Promise<Check[]> {
  const checks: Check[] = [];
  const [major, minor] = process.versions.node.split(".").map(Number) as [number, number];
  const nodeOk = major > 20 || (major === 20 && minor >= 12);
  checks.push({ name: "Node", status: nodeOk ? "ok" : "fail", detail: `${process.versions.node}${nodeOk ? "" : " (need 20.12 or newer)"}` });

  const py = await sh("python3", ["--version"]);
  const pyVersion = /Python (\d+)\.(\d+)/.exec(py.out);
  const pyOk = !!pyVersion && (Number(pyVersion[1]) > 3 || Number(pyVersion[2]) >= 9);
  checks.push({ name: "Python", status: pyOk ? "ok" : "fail", detail: pyVersion ? pyVersion[0] : "python3 not found (need 3.9+)" });

  const dl = await sh("python3", ["-m", "data_layer", "doctor"], repoDir, 120_000);
  checks.push({ name: "data layer", status: "ok", detail: repoDir });
  checks.push(...readDataLayerDoctor(dl.out));

  const client = new NightshiftClient();
  const health = await nightshiftHealth(client);
  checks.push({ name: "Nightshift", status: health.ok ? "ok" : "fail", detail: health.detail });
  if (health.ok) {
    try {
      // A fresh prompt each time, so the answer comes from the model and not from Nightshift's cache.
      const r = await client.chat({ purpose: "doctor", model: INVESTIGATOR_MODEL, messages: [{ role: "user", content: `Reply with: ok (check ${Date.now()})` }] });
      const cached = r.receipt.cacheStatus === "hit";
      checks.push({ name: "Nemotron", status: cached ? "warn" : "ok", detail: `answered by ${r.receipt.routedModel ?? "unknown model"} in ${r.latencyMs} ms${cached ? " (from Nightshift's cache, not a live call)" : ""}` });
    } catch (err) {
      checks.push({ name: "Nemotron", status: "fail", detail: (err as Error).message.slice(0, 200) });
    }
  }

  const gh = await sh("gh", ["auth", "status"]);
  const account = /account (\S+)/.exec(gh.out)?.[1];
  checks.push({ name: "GitHub CLI", status: gh.code === 0 ? "ok" : "warn", detail: gh.code === 0 ? `logged in${account ? ` as ${account}` : ""} (needed for pr and watch)` : "not logged in: run `gh auth login` before using pr or watch" });
  return checks;
}

export function printChecks(checks: Check[]): void {
  const mark = { ok: "ok  ", warn: "warn", fail: "FAIL" } as const;
  for (const c of checks) console.log(`${mark[c.status]}  ${c.name.padEnd(24)} ${c.detail}`);
}

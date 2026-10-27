import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_DIR, EXIT, dataRepo, exitCodeFor, runsDir } from "../src/config.js";
import { readDataLayerDoctor } from "../src/doctor.js";

describe("domino command settings", () => {
  it("finds the data layer from a flag, then DOMINO_DATA_REPO (relative to agent/), then this repo", () => {
    const other = mkdtempSync(join(tmpdir(), "domino-repo-"));
    mkdirSync(join(other, "data_layer"));
    expect(dataRepo(other, "/", {})).toBe(other);
    expect(dataRepo(undefined, "/", { DOMINO_DATA_REPO: other })).toBe(other);
    expect(dataRepo(undefined, "/", {})).toBe(resolve(AGENT_DIR, ".."));
    expect(() => dataRepo(tmpdir(), "/", {})).toThrow("No data_layer/");
  });

  it("writes runs to a flat folder the dashboard reads: --out, then DOMINO_RUNS_DIR, then agent/runs/live", () => {
    expect(runsDir("x", "/work", {})).toBe("/work/x");
    expect(runsDir(undefined, "/work", { DOMINO_RUNS_DIR: "runs/elsewhere" })).toBe(join(AGENT_DIR, "runs/elsewhere"));
    expect(runsDir(undefined, "/work", {})).toBe(join(AGENT_DIR, "runs", "live"));
    expect(runsDir(undefined, "/work", {}, "/Users/x/.npm/_npx/abc/node_modules/domino-check")).toBe("/work/domino-runs/live");
  });

  it("maps verdicts to exit codes a CI step can use", () => {
    expect(exitCodeFor({ verdict: "no_failure_observed", outage: false }, true)).toBe(EXIT.ok);
    expect(exitCodeFor({ verdict: "reproduced_failure", outage: false }, false)).toBe(EXIT.ok);
    expect(exitCodeFor({ verdict: "reproduced_failure", outage: false }, true)).toBe(EXIT.reproduced);
    expect(exitCodeFor({ verdict: "inconclusive", outage: false }, true)).toBe(EXIT.outage);
    expect(exitCodeFor({ verdict: "reproduced_failure", outage: true }, true)).toBe(EXIT.outage);
  });
});

describe("domino doctor", () => {
  const out = (mode: string, login: string) =>
    `.env file: found\nDOMINO_DATA_MODE: ${mode}\ndocker on PATH: yes\nworlds: ['w-a1', 'w-b2', 'w-c3']\nzetaris admin login + SELECT 1: ok\nzetaris agent login + SELECT 1: ${login}\n`;

  it("reports mode, the read-only login and a world count, never the world ids", () => {
    const checks = readDataLayerDoctor(out("live", "ok"));
    expect(checks.map((c) => c.status)).toEqual(["ok", "ok", "ok"]);
    expect(checks.find((c) => c.name === "worlds")!.detail).toBe("3 available");
    expect(JSON.stringify(checks)).not.toContain("w-a1");
  });

  it("warns when the data layer is not live, and fails a broken live login", () => {
    expect(readDataLayerDoctor(out("fake", "FAILED (not configured: x)"))[0]!.status).toBe("warn");
    expect(readDataLayerDoctor(out("live", "FAILED (401: denied)"))[1]!.status).toBe("fail");
  });
});

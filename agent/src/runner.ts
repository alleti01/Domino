// One live investigation with everything a run leaves behind: trace, summary, cassette, bundle and
// report.md in <outDir>/<run_id>/, receipts in <outDir>/receipts.jsonl. Shared by `run` and `pr`.

import { join } from "node:path";
import type { RunMode, RunSummary } from "../../contracts/agent/types.js";
import type { WorldsAdapter } from "./adapters.js";
import { DataLayerEvidence, DataLayerWorlds } from "./adapters/practice.js";
import { DEFAULT_CRITIC, INVESTIGATOR_MODEL, investigate } from "./agent.js";
import { writeBundle } from "./bundle.js";
import { StubEvidence, StubWorlds } from "./fakes/stubWorld.js";
import { NightshiftClient, nightshiftHealth } from "./llm/nightshift.js";
import { ReceiptLog } from "./llm/receipts.js";
import { Recorder } from "./replay.js";

export type DataSource = "stub" | "practice" | "data_layer";
export const MODES: RunMode[] = ["full", "no_tools", "no_experiments", "no_usl"];

export interface RunOptions {
  changeId: string;
  mode: RunMode;
  outDir: string;
  data: DataSource;
  repoDir: string;
  critic: boolean;
  memoryDir?: string;
  /** Wraps the worlds adapter, e.g. to attach where the change came from (a pull request). */
  wrapWorlds?: (inner: WorldsAdapter) => WorldsAdapter;
}

export async function runInvestigation(o: RunOptions): Promise<{ summary: RunSummary; runDir: string }> {
  const dataOpts = { repoDir: o.repoDir, module: o.data };
  const critic = o.critic ? DEFAULT_CRITIC : undefined;
  const recorder = new Recorder(o.changeId, o.mode, o.data, { investigator_model: INVESTIGATOR_MODEL, ...(critic ? { critic } : {}) });
  const client = new NightshiftClient({ receiptLog: new ReceiptLog(join(o.outDir, "receipts.jsonl")) });
  const worlds: WorldsAdapter = o.data === "stub" ? new StubWorlds() : new DataLayerWorlds(dataOpts);
  const summary = await investigate({
    healthCheck: () => nightshiftHealth(client),
    investigatorModel: INVESTIGATOR_MODEL,
    ...(critic ? { critic } : {}),
    changeId: o.changeId,
    mode: o.mode,
    outDir: o.outDir,
    model: recorder.model(client),
    evidence: recorder.evidence(o.data === "stub" ? new StubEvidence() : new DataLayerEvidence(dataOpts)),
    worlds: recorder.worlds(o.wrapWorlds ? o.wrapWorlds(worlds) : worlds),
    ...(o.memoryDir ? { memoryDir: o.memoryDir } : {}),
  });
  const runDir = join(o.outDir, summary.run_id);
  await recorder.save(join(runDir, "cassette.json"), summary);
  await writeBundle(runDir, summary.cause_claim);
  return { summary, runDir };
}

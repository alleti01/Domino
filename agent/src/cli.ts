// domino investigate --change <id> --mode <full|no_tools|no_experiments|no_usl> --out <dir> [--stub] [--memory <dir>]
// --memory persists the Meterless World Model so later runs start from verified topology (keep it off for scorecard runs).

import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import type { RunMode } from "../../contracts/agent/types.js";
import { investigate } from "./agent.js";
import { DataLayerEvidence, DataLayerWorlds } from "./adapters/practice.js";
import { StubEvidence, StubWorlds } from "./fakes/stubWorld.js";
import { NightshiftClient } from "./llm/nightshift.js";
import { ReceiptLog } from "./llm/receipts.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    change: { type: "string" },
    mode: { type: "string", default: "full" },
    out: { type: "string", default: "runs" },
    stub: { type: "boolean", default: false },
    memory: { type: "string" },
    data: { type: "string" },
    repo: { type: "string", default: ".." },
  },
});

if (positionals[0] !== "investigate" || !values.change) {
  console.error("usage: domino investigate --change <world-id> [--mode full|no_tools|no_experiments|no_usl] [--data practice|data_layer] [--repo <team-repo>] [--out runs] [--memory <dir>] [--stub]");
  process.exit(2);
}
const modes: RunMode[] = ["full", "no_tools", "no_experiments", "no_usl"];
if (!modes.includes(values.mode as RunMode)) {
  console.error(`--mode must be one of ${modes.join(", ")}`);
  process.exit(2);
}
const source = values.stub ? "stub" : (values.data ?? "practice");
if (!["stub", "practice", "data_layer"].includes(source)) {
  console.error("--data must be practice or data_layer (or pass --stub)");
  process.exit(2);
}
const dataOpts = { repoDir: values.repo!, module: source };

const summary = await investigate({
  changeId: values.change,
  mode: values.mode as RunMode,
  outDir: values.out!,
  model: new NightshiftClient({ receiptLog: new ReceiptLog(`${values.out}/receipts.jsonl`) }),
  evidence: source === "stub" ? new StubEvidence() : new DataLayerEvidence(dataOpts),
  worlds: source === "stub" ? new StubWorlds() : new DataLayerWorlds(dataOpts),
  ...(values.memory ? { memoryDir: values.memory } : {}),
});
console.log(JSON.stringify(summary, null, 2));

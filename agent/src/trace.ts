// Writes the investigation trace (contract: TraceEvent, JSONL) that Adhvik's dashboard,
// replay mode and Anish's scorecard all read.

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunMode, RunSummary, TraceEvent } from "../../contracts/agent/types.js";

type EventBody = TraceEvent extends infer E ? (E extends TraceEvent ? Omit<E, "run_id" | "seq" | "ts" | "mode" | "replay"> : never) : never;

export class TraceWriter {
  private seq = 0;
  readonly events: TraceEvent[] = [];

  constructor(
    readonly runId: string,
    readonly mode: RunMode,
    readonly outDir: string,
    readonly replay = false,
  ) {}

  get tracePath() {
    return join(this.outDir, "trace.jsonl");
  }

  async init(): Promise<void> {
    await mkdir(this.outDir, { recursive: true });
    await writeFile(this.tracePath, "");
  }

  async emit(event: EventBody): Promise<TraceEvent> {
    const full = { run_id: this.runId, seq: ++this.seq, ts: new Date().toISOString(), mode: this.mode, replay: this.replay, ...event } as TraceEvent;
    this.events.push(full);
    await appendFile(this.tracePath, `${JSON.stringify(full)}\n`);
    return full;
  }

  async writeSummary(summary: RunSummary): Promise<void> {
    await writeFile(join(this.outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  }
}

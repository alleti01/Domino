// Record / replay ("cassettes") for judge-friendly sample mode.
//
// A live run records every model response (with its Nightshift receipt) and every data-layer
// result. Replay re-runs the SAME agent code against that recording: the gateway, World Model,
// harness confirmation and deterministic judge all execute again, with no Nightshift, no Zetaris,
// no keys and no Python. Every replayed trace event is marked replay: true.

import { readFile, writeFile } from "node:fs/promises";
import type {
  ChangeRequest,
  DependencyPath,
  ExperimentCatalog,
  ExperimentRequest,
  ExperimentResult,
  QueryResult,
  RunSummary,
} from "../../contracts/agent/types.js";
import type { ChatModel } from "./agent.js";
import type { EvidenceAdapter, WorldsAdapter } from "./adapters.js";
import { type ChatRequest, type ChatResult, NightshiftError } from "./llm/nightshift.js";

export const CASSETTE_VERSION = 1;

export interface Cassette {
  version: number;
  recorded_at: string;
  change_id: string;
  mode: string;
  data_source: string;
  model: ChatResult[];
  calls: Array<{ method: string; key: string; result: unknown }>;
  summary?: RunSummary;
}

const keyOf = (args: unknown[]) => JSON.stringify(args);

export class Recorder {
  readonly cassette: Cassette;
  constructor(changeId: string, mode: string, dataSource: string) {
    this.cassette = { version: CASSETTE_VERSION, recorded_at: new Date().toISOString(), change_id: changeId, mode, data_source: dataSource, model: [], calls: [] };
  }

  model(inner: ChatModel): ChatModel {
    return {
      chat: async (req: ChatRequest) => {
        const result = await inner.chat(req);
        this.cassette.model.push(result);
        return result;
      },
    };
  }

  private wrap<T>(method: string, fn: (...args: any[]) => Promise<T>) {
    return async (...args: any[]): Promise<T> => {
      const result = await fn(...args);
      this.cassette.calls.push({ method, key: keyOf(args), result });
      return result;
    };
  }

  evidence(inner: EvidenceAdapter): EvidenceAdapter {
    return {
      query: this.wrap("query", (sql: string) => inner.query(sql)),
      dependencyPath: this.wrap("dependencyPath", (c: string, e: string) => inner.dependencyPath(c, e)),
      describe: this.wrap("describe", () => inner.describe()),
    };
  }

  worlds(inner: WorldsAdapter): WorldsAdapter {
    return {
      getChange: this.wrap("getChange", (id: string) => inner.getChange(id)),
      catalog: this.wrap("catalog", (id: string) => inner.catalog(id)),
      run: this.wrap("run", (req: ExperimentRequest) => inner.run(req)),
    };
  }

  async save(path: string, summary: RunSummary): Promise<void> {
    await writeFile(path, `${JSON.stringify({ ...this.cassette, summary }, null, 1)}\n`);
  }
}

export class CassetteOutOfDate extends Error {}

/** Serves recorded results. Calls are matched by method + arguments, in recorded order. */
export class Player {
  private modelIndex = 0;
  private readonly used = new Set<number>();
  constructor(readonly cassette: Cassette) {
    if (cassette.version !== CASSETTE_VERSION) throw new CassetteOutOfDate(`cassette version ${cassette.version}, expected ${CASSETTE_VERSION}`);
  }

  static async load(path: string): Promise<Player> {
    return new Player(JSON.parse(await readFile(path, "utf8")) as Cassette);
  }

  model(): ChatModel {
    return {
      chat: async (_req: ChatRequest) => {
        const next = this.cassette.model[this.modelIndex++];
        if (!next) throw new NightshiftError("Recording has no more model responses", "offline");
        return next;
      },
    };
  }

  private serve<T>(method: string, args: unknown[]): T {
    const key = keyOf(args);
    const idx = this.cassette.calls.findIndex((c, i) => !this.used.has(i) && c.method === method && c.key === key);
    if (idx === -1) {
      throw new CassetteOutOfDate(`No recorded ${method}(${key.slice(0, 160)}). The agent changed since this run was recorded; re-record it.`);
    }
    this.used.add(idx);
    return structuredClone(this.cassette.calls[idx]!.result) as T;
  }

  evidence(): EvidenceAdapter {
    return {
      query: async (sql: string) => this.serve<QueryResult>("query", [sql]),
      dependencyPath: async (c: string, e: string) => this.serve<DependencyPath>("dependencyPath", [c, e]),
      describe: async () => this.serve<Array<{ view: string; source: string; columns: string[] }>>("describe", []),
    };
  }

  worlds(): WorldsAdapter {
    return {
      getChange: async (id: string) => this.serve<ChangeRequest>("getChange", [id]),
      catalog: async (id: string) => this.serve<ExperimentCatalog>("catalog", [id]),
      run: async (req: ExperimentRequest) => this.serve<ExperimentResult>("run", [req]),
    };
  }

  unusedModelResponses(): number {
    return this.cassette.model.length - this.modelIndex;
  }
}

// Adapter to Anish's data layer (contract v0.2) via its JSON CLI:
//   python3 -m <module> describe|path|lookup|run ...
// Today the module is `practice` (his 10 made-up scenarios); his real `data_layer` exposes the
// same calls, so switching is a module-name change. The agent never sees this file's details.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  ChangeRequest,
  DependencyPath,
  ExperimentCatalog,
  ExperimentRequest,
  ExperimentResult,
  QueryResult,
} from "../../../contracts/agent/types.js";
import type { EvidenceAdapter, WorldsAdapter } from "../adapters.js";

const run = promisify(execFile);

/** Zetaris (or the data layer) is down or timed out: an outage, never an agent mistake. */
export class DataLayerUnavailable extends Error {
  override name = "DataLayerUnavailable";
}
const OUTAGE_STATUSES = new Set(["unavailable", "timeout"]);

// Row ids come back as "unknown:con-0001" when a query omits source_system; the same row from
// dependency_path is "config_repo:con-0001". Map the row-id prefix back to its table so citations match.
const PREFIX_TO_TABLE: Record<string, string> = { con: "config_repo", tel: "telemetry", cod: "code_index", "db_": "db_catalog", sch: "schema_registry" };
export function normalizeRowId(id: string): string {
  const m = /^unknown:(([a-z_]{3})-\d+)$/.exec(id);
  const table = m ? PREFIX_TO_TABLE[m[2]!] : undefined;
  return m && table ? `${table}:${m[1]}` : id;
}
const FACT_TABLES = ["config_repo", "telemetry", "code_index", "db_catalog", "schema_registry"];

export interface DataLayerOptions {
  /** Directory containing the Python package (the team repo root). */
  repoDir: string;
  /** "practice" now, "data_layer" once the real worlds + Zetaris land. */
  module?: string;
  python?: string;
}

class DataLayerCli {
  constructor(private readonly opts: DataLayerOptions) {}
  async call(...args: string[]): Promise<any> {
    try {
      const { stdout } = await run(this.opts.python ?? "python3", ["-m", this.opts.module ?? "practice", ...args], {
        cwd: this.opts.repoDir,
        timeout: 120_000,
        maxBuffer: 20 * 1024 * 1024,
      });
      return JSON.parse(stdout);
    } catch (err: any) {
      // The CLI exits 1 with a JSON body when status != ok; keep that body.
      if (err?.stdout) {
        try {
          return JSON.parse(err.stdout);
        } catch {
          /* fall through */
        }
      }
      throw new Error(`data layer call failed (${args[0]}): ${err?.message ?? err}`);
    }
  }
}

/** `tables` (contract v0.3): USL tables with full names, plus the column that scopes rows to one system. */
async function listTables(cli: DataLayerCli): Promise<{ systemColumn: string; tables: any[] } | null> {
  try {
    const t = await cli.call("tables");
    if (t.status !== "ok") return null;
    return { systemColumn: t.system_column ?? "system_id", tables: t.tables ?? [] };
  } catch {
    return null; // v0.2 data layers have no `tables` command
  }
}

export class DataLayerWorlds implements WorldsAdapter {
  private readonly opts: DataLayerOptions;
  private readonly cli: DataLayerCli;
  private readonly cache = new Map<string, any>();
  private tables?: Promise<{ systemColumn: string; tables: any[] } | null>;
  constructor(opts: DataLayerOptions) {
    this.opts = opts;
    this.cli = new DataLayerCli(opts);
  }

  async describe(world: string): Promise<any> {
    if (!this.cache.has(world)) {
      const d = await this.cli.call("describe", world);
      if (d.status !== "ok") throw new Error(d.error ?? `describe ${world} failed`);
      this.cache.set(world, d);
    }
    return this.cache.get(world);
  }

  /** `changeId` is the world id (each world carries one proposed change). */
  async getChange(changeId: string): Promise<ChangeRequest> {
    const d = await this.describe(changeId);
    const components = (d.components ?? []).map((c: any) => `${c.name} (${c.role})`).join("; ");
    return {
      change_id: d.change.entity_id,
      world_id: d.world,
      title: d.change.title,
      description:
        `${d.change.description}${components ? `\nSystem components: ${components}.` : ""}` +
        `\nSemantic-layer rows for this system have ${(await (this.tables ??= listTables(this.cli)))?.systemColumn ?? "scenario_id"} = '${d.world}'; other values belong to unrelated systems.`,
      diff: d.change.diff,
      files: d.change.files ?? [],
    };
  }

  async catalog(worldId: string): Promise<ExperimentCatalog> {
    const d = await this.describe(worldId);
    return {
      world_id: worldId,
      variants: ["baseline", "candidate", "control"],
      params: Object.entries(d.params ?? {}).map(([name, spec]: [string, any]) => ({
        name,
        type: typeof spec?.default === "number" ? "number" : typeof spec?.default === "boolean" ? "boolean" : "string",
        description: spec?.description ?? name,
        default: spec?.default ?? "",
      })),
      observables: (d.metrics ?? []).map((m: string) => ({ name: m, description: "metric reported by the world" })),
      workloads: [{ name: "default", description: "the world's standard workload" }],
    };
  }

  async run(req: ExperimentRequest): Promise<ExperimentResult> {
    const args = ["run", req.world_id, req.variant];
    if (req.params && Object.keys(req.params).length && this.opts.module !== "practice") args.push("--params", JSON.stringify(req.params));
    const r = await this.cli.call(...args);
    if (OUTAGE_STATUSES.has(r.status)) throw new DataLayerUnavailable(`experiment ${req.variant} ${r.status}: ${r.error ?? ""}`);
    const completed = r.status === "ok";
    return {
      experiment_id: r.experiment_id ?? `x-${Date.now()}`,
      request: req,
      completed,
      // Every metric is returned: the world decides what it measures, the agent decides what matters.
      observations: r.metrics ?? {},
      assertions: (r.assertions ?? []).map((a: any) => ({
        name: a.name,
        passed: Boolean(a.passed),
        detail: `observed ${a.observed}, expected ${a.expected}`,
      })),
      logs_tail: Array.isArray(r.logs) ? r.logs.join("\n") : String(r.logs ?? r.error ?? ""),
      artifacts: (r.artifacts ?? []).map((a: any) => ({ name: a.name, sha256: a.sha256, bytes: a.bytes })),
      duration_ms: r.duration_ms ?? 0,
      ...(r.reproduce?.command ? { reproduce: r.reproduce.command } : {}),
    };
  }
}

export class DataLayerEvidence implements EvidenceAdapter {
  private readonly cli: DataLayerCli;
  private views?: Array<{ view: string; source: string; columns: string[] }>;
  constructor(opts: DataLayerOptions) {
    this.cli = new DataLayerCli(opts);
  }

  async describe() {
    if (!this.views) {
      const listed = await listTables(this.cli);
      if (listed) {
        this.views = listed.tables.map((t: any) => ({
          view: t.name,
          source: `${(t.source_systems ?? []).join(", ") || "semantic layer"}${t.description ? ` (${t.description})` : ""}`,
          columns: (t.columns ?? []).map((c: any) => (typeof c === "string" ? c : c.name)),
        }));
        return this.views;
      }
      const views: Array<{ view: string; source: string; columns: string[] }> = [];
      for (const table of FACT_TABLES) {
        const r = await this.cli.call("lookup", `SELECT DISTINCT source_system FROM ${table}`);
        views.push({
          view: table,
          source: (r.rows ?? []).map((x: any) => x.source_system).join(", ") || table,
          columns: ["scenario_id", "subject", "key", "value", "source_system", "source_row_id"],
        });
      }
      views.push({
        view: "dependency_edge",
        source: "semantic layer joins",
        columns: ["scenario_id", "edge_id", "from_id", "from_type", "to_id", "to_type", "relation", "edge_status", "evidence", "detail"],
      });
      this.views = views;
    }
    return this.views;
  }

  async query(sql: string): Promise<QueryResult> {
    const r = await this.cli.call("lookup", sql);
    if (OUTAGE_STATUSES.has(r.status)) throw new DataLayerUnavailable(`semantic layer ${r.status}: ${r.error ?? ""}`);
    if (r.status === "not_in_sample") {
      return { query_id: r.query_id ?? `q-${Date.now()}`, sql, columns: [], rows: [], elapsed_ms: 0, from_snapshot: true, error: "This query was not recorded in sample mode. Use get_dependency_path and experiments, or a recorded query." };
    }
    const rows = (r.rows ?? []) as Array<Record<string, string | null>>;
    return {
      query_id: r.query_id ?? `q-${Date.now()}`,
      sql: r.sql ?? sql,
      columns: r.columns ?? [],
      rows: rows.map((row, i) => ({
        row_id: normalizeRowId(r.row_ids?.[i] ?? `row-${i}`),
        source: row.source_system ?? "semantic_layer",
        values: Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? ""])),
      })),
      elapsed_ms: r.duration_ms ?? 0,
      from_snapshot: r.mode === "practice",
      ...(r.status !== "ok" ? { error: r.error ?? r.status } : {}),
    };
  }

  async dependencyPath(changeId: string, entity: string): Promise<DependencyPath> {
    const r = await this.cli.call("path", entity);
    if (OUTAGE_STATUSES.has(r.status)) throw new DataLayerUnavailable(`dependency_path ${r.status}: ${r.error ?? ""}`);
    if (r.status !== "ok") throw new Error(r.error ?? `dependency_path ${entity} failed`);
    const nodes = new Map<string, DependencyPath["nodes"][number]>();
    const edges: DependencyPath["edges"] = [];
    const seen = new Set<string>();
    const label = (id: string) => id.split("/").slice(2).join("/") || id;
    for (const path of r.paths ?? []) {
      for (const hop of path.hops ?? []) {
        const rowIds = (hop.evidence ?? []).map((e: any) => `${e.source_system}:${e.source_row_id}`);
        const first = rowIds[0] ?? `edge:${hop.from}->${hop.to}`;
        const source = hop.evidence?.[0]?.source_system ?? "semantic_layer";
        for (const [id, kind] of [[hop.from, hop.from_type], [hop.to, hop.to_type]] as const) {
          if (!nodes.has(id)) nodes.set(id, { id, kind, label: label(id), source, row_id: first });
        }
        const key = `${hop.from}|${hop.relation}|${hop.to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ from: hop.from, to: hop.to, relation: hop.relation, status: hop.edge_status, source, row_id: first, row_ids: rowIds, detail: hop.detail });
      }
    }
    for (const u of r.unresolved ?? []) {
      const key = `${u.from}|${u.relation}|${u.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rowIds = (u.evidence ?? []).map((e: any) => `${e.source_system}:${e.source_row_id}`);
      edges.push({ from: u.from, to: u.to, relation: u.relation, status: "unresolved", source: u.evidence?.[0]?.source_system ?? "semantic_layer", row_id: rowIds[0] ?? "", row_ids: rowIds, detail: u.reason });
    }
    const dq_issues = (r.dq_issues ?? []).map((d: any) => ({ rule: String(d.rule ?? ""), row_id: String(d.row_id ?? ""), detail: String(d.detail ?? "") }));
    return { change_id: changeId, nodes: [...nodes.values()], edges, dq_issues };
  }
}

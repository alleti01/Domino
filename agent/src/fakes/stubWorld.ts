// THROWAWAY STUB, never shipped. It speaks the hand-off contract so the agent loop can be
// built before Anish's real worlds + Zetaris exist. Anish owns the real recreations; delete
// this once his adapter is wired in. Deliberately tiny and generic: one producer → consumer
// chain where a permission change can widen what a query returns.

import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type {
  ChangeRequest,
  DependencyPath,
  ExperimentCatalog,
  ExperimentRequest,
  ExperimentResult,
  QueryResult,
} from "../../../contracts/agent/types.js";
import type { EvidenceAdapter, WorldsAdapter } from "../adapters.js";

const CHANGES: ChangeRequest[] = [
  {
    change_id: "stub-chg-1",
    world_id: "stub-w1",
    title: "Give svc_builder read access to the mirror schema",
    description: "Analysts asked for the mirror schema to be readable by the build service account.",
    diff: "--- a/grants.sql\n+++ b/grants.sql\n@@\n GRANT SELECT ON main.* TO svc_builder;\n+GRANT SELECT ON mirror.* TO svc_builder;\n",
    files: ["grants.sql"],
  },
  {
    change_id: "stub-chg-2",
    world_id: "stub-w1",
    title: "Give svc_reports read access to the mirror schema",
    description: "Reporting needs the mirror schema.",
    diff: "--- a/grants.sql\n+++ b/grants.sql\n@@\n GRANT SELECT ON main.* TO svc_reports;\n+GRANT SELECT ON mirror.* TO svc_reports;\n",
    files: ["grants.sql"],
  },
];

// Several independent "sources", so no single one shows the whole chain.
const SEED = `
CREATE TABLE grants (row_id TEXT, source TEXT, principal TEXT, object TEXT, privilege TEXT);
INSERT INTO grants VALUES
 ('g1','grant_catalog','svc_builder','main.*','SELECT'),
 ('g2','grant_catalog','svc_reports','main.*','SELECT');
CREATE TABLE services (row_id TEXT, source TEXT, service TEXT, runs_as TEXT, reads TEXT, query_text TEXT, produces TEXT);
INSERT INTO services VALUES
 ('s1','service_registry','builder','svc_builder','catalog.columns','SELECT name FROM catalog.columns WHERE tbl = ''items''','items.list'),
 ('s2','service_registry','reports','svc_reports','catalog.columns','SELECT name, schema FROM catalog.columns','report.csv');
CREATE TABLE artifacts (row_id TEXT, source TEXT, artifact TEXT, producer TEXT, consumer TEXT);
INSERT INTO artifacts VALUES
 ('a1','deploy_manifest','items.list','builder','loader'),
 ('a2','deploy_manifest','report.csv','reports','dashboard');
CREATE TABLE limits (row_id TEXT, source TEXT, service TEXT, setting TEXT, value TEXT);
INSERT INTO limits VALUES
 ('l1','runtime_config','loader','max_items','50'),
 ('l2','runtime_config','dashboard','max_rows','100000');
CREATE TABLE observations (row_id TEXT, source TEXT, service TEXT, metric TEXT, value TEXT, window TEXT);
INSERT INTO observations VALUES
 ('o1','telemetry','builder','items_written','30','7d p99'),
 ('o2','telemetry','reports','rows_written','1200','7d p99');
`;

const VIEWS = [
  { view: "grants", source: "grant_catalog", columns: ["row_id", "principal", "object", "privilege"] },
  { view: "services", source: "service_registry", columns: ["row_id", "service", "runs_as", "reads", "query_text", "produces"] },
  { view: "artifacts", source: "deploy_manifest", columns: ["row_id", "artifact", "producer", "consumer"] },
  { view: "limits", source: "runtime_config", columns: ["row_id", "service", "setting", "value"] },
  { view: "observations", source: "telemetry", columns: ["row_id", "service", "metric", "value", "window"] },
];

export class StubEvidence implements EvidenceAdapter {
  private db = new DatabaseSync(":memory:");
  private n = 0;
  constructor() {
    this.db.exec(SEED);
  }

  async describe() {
    return VIEWS;
  }

  async query(sql: string): Promise<QueryResult> {
    const started = Date.now();
    const query_id = `q${++this.n}`;
    try {
      const rows = this.db.prepare(sql).all() as Array<Record<string, unknown>>;
      const columns = rows[0] ? Object.keys(rows[0]) : [];
      return {
        query_id,
        sql,
        columns,
        rows: rows.map((r, i) => ({
          row_id: String(r.row_id ?? `${query_id}-r${i}`),
          source: String(r.source ?? "usl"),
          values: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])),
        })),
        elapsed_ms: Date.now() - started,
        from_snapshot: true,
      };
    } catch (err) {
      return { query_id, sql, columns: [], rows: [], elapsed_ms: Date.now() - started, from_snapshot: true, error: (err as Error).message };
    }
  }

  async dependencyPath(changeId: string, entity: string): Promise<DependencyPath> {
    // Generic walk over the stub's relationship columns; the real one comes from Zetaris.
    const nodes = new Map<string, DependencyPath["nodes"][number]>();
    const edges: DependencyPath["edges"] = [];
    const add = (id: string, kind: string, source: string, row_id: string) => {
      if (!nodes.has(id)) nodes.set(id, { id, kind, label: id, source, row_id });
    };
    const frontier = [entity];
    const seen = new Set<string>();
    while (frontier.length && seen.size < 25) {
      const cur = frontier.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const rel = (rows: any[], from: string, to: string, relation: string, kindFrom: string, kindTo: string, source: string) => {
        for (const r of rows) {
          if (r[from] !== cur && r[to] !== cur) continue;
          add(r[from], kindFrom, source, r.row_id);
          add(r[to], kindTo, source, r.row_id);
          if (edges.some((e) => e.row_id === r.row_id && e.relation === relation)) continue;
          edges.push({ from: r[from], to: r[to], relation, status: "observed", source, row_id: r.row_id });
          frontier.push(r[from] === cur ? r[to] : r[from]);
        }
      };
      rel(this.db.prepare("SELECT * FROM grants").all(), "principal", "object", "granted_on", "principal", "object", "grant_catalog");
      rel(this.db.prepare("SELECT * FROM services").all(), "runs_as", "service", "identity_of", "principal", "service", "service_registry");
      rel(this.db.prepare("SELECT * FROM services").all(), "service", "produces", "produces", "service", "artifact", "service_registry");
      rel(this.db.prepare("SELECT * FROM artifacts").all(), "artifact", "consumer", "consumed_by", "artifact", "service", "deploy_manifest");
      rel(this.db.prepare("SELECT * FROM limits").all(), "service", "setting", "bounded_by", "service", "limit", "runtime_config");
    }
    return { change_id: changeId, nodes: [...nodes.values()], edges, dq_issues: [] };
  }
}

export class StubWorlds implements WorldsAdapter {
  private n = 0;

  async getChange(changeId: string): Promise<ChangeRequest> {
    const change = CHANGES.find((c) => c.change_id === changeId);
    if (!change) throw new Error(`Unknown change ${changeId}`);
    return change;
  }

  async catalog(worldId: string): Promise<ExperimentCatalog> {
    return {
      world_id: worldId,
      variants: ["baseline", "candidate", "control"],
      params: [{ name: "base_items", type: "number", description: "How many source rows exist in the main schema", default: 30 }],
      observables: [
        { name: "query_rows", description: "Rows returned by each service's read query" },
        { name: "distinct_names", description: "Distinct names in each service's query result" },
        { name: "artifact_entries", description: "Entries written to each produced artifact" },
        { name: "consumer_status", description: "Whether each consumer loaded its input" },
      ],
      workloads: [{ name: "standard", description: "One normal build-and-load cycle for every service" }],
      overridable: [
        { target: "loader.max_items", current: 50, type: "number", description: "loader setting" },
        { target: "builder.schema_filter", current: "none", type: "string", description: "builder query setting" },
      ],
    };
  }

  async run(req: ExperimentRequest): Promise<ExperimentResult> {
    const started = Date.now();
    const change = await this.getChange(req.change_id);
    const base = Number(req.params?.base_items ?? 30);
    const overrides = (req.params?.overrides ?? {}) as Record<string, string | number | boolean>;
    const unknown = Object.keys(overrides).filter((k) => !["loader.max_items", "builder.schema_filter"].includes(k));
    if (unknown.length) {
      return { experiment_id: `x${++this.n}`, request: req, completed: false, observations: {}, assertions: [], logs_tail: `unsupported override: ${unknown.join(", ")}`, artifacts: [], duration_ms: 0 };
    }
    const mirrorGrantedTo = req.variant === "candidate" && change.change_id === "stub-chg-1" ? "svc_builder" : req.variant === "candidate" ? "svc_reports" : null;
    // builder's query does not filter by schema: visibility of a second schema duplicates names.
    const schemaFiltered = overrides["builder.schema_filter"] === "main";
    const builderRows = mirrorGrantedTo === "svc_builder" && !schemaFiltered ? base * 2 : base;
    const builderDistinct = base;
    const reportsRows = mirrorGrantedTo === "svc_reports" ? 1200 * 2 : 1200;
    const loaderLimit = Number(overrides["loader.max_items"] ?? 50);
    const loaderOk = builderRows <= loaderLimit;
    const observations: ExperimentResult["observations"] = {
      "builder.query_rows": builderRows,
      "builder.distinct_names": builderDistinct,
      "items.list.artifact_entries": builderRows,
      "reports.query_rows": reportsRows,
      "report.csv.artifact_entries": reportsRows,
      "loader.consumer_status": loaderOk ? "loaded" : `error: ${builderRows} items exceeds max_items`,
      "dashboard.consumer_status": "loaded",
    };
    const wanted = req.observe.length ? req.observe : ["consumer_status"];
    const filtered = Object.fromEntries(Object.entries(observations).filter(([k]) => wanted.some((w) => k.endsWith(w))));
    const artifact = JSON.stringify({ entries: builderRows });
    return {
      experiment_id: `x${++this.n}`,
      request: req,
      completed: true,
      observations: filtered,
      assertions: [
        { name: "loader.loads_input", passed: loaderOk, detail: loaderOk ? "loaded" : "load rejected" },
        { name: "dashboard.loads_input", passed: true, detail: "loaded" },
      ],
      logs_tail: loaderOk ? "cycle ok" : `loader: rejected items.list (${builderRows} > ${loaderLimit})`,
      artifacts: [{ name: "items.list", sha256: createHash("sha256").update(artifact).digest("hex"), bytes: artifact.length }],
      duration_ms: Date.now() - started,
    };
  }
}

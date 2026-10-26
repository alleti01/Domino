// Typed tool gateway. Nemotron never gets a shell or secrets: it can only call these tools,
// every argument is validated, SQL is read-only, citations must point at evidence it has
// actually retrieved, and every call counts against the run budget.

import type { ExperimentCatalog, ExperimentRequest, ExperimentResult, RunMode } from "../../contracts/agent/types.js";
import type { EvidenceAdapter, WorldsAdapter } from "./adapters.js";
import type { ToolSpec } from "./llm/nightshift.js";
import type { InvestigationWorld } from "./engines/worldModel.js";
import type { InvestigationState } from "./state.js";
import type { TraceWriter } from "./trace.js";
import { quantities } from "./numbers.js";

export interface Budgets {
  max_steps: number;
  max_model_calls: number;
  max_ms: number;
  max_experiments: number;
  max_queries: number;
}

export const DEFAULT_BUDGETS: Budgets = { max_steps: 20, max_model_calls: 26, max_ms: 10 * 60_000, max_experiments: 10, max_queries: 8 };

type JsonType = "string" | "number" | "boolean" | "string[]" | "object";
interface ToolDef {
  name: string;
  description: string;
  args: Record<string, { type: JsonType; description: string; required?: boolean; enum?: string[] }>;
  group: "evidence" | "experiment" | "reasoning";
}

const TOOLS: ToolDef[] = [
  {
    name: "describe_sources",
    group: "evidence",
    description: "List the semantic-layer views you can query, which independent source each comes from, and their columns.",
    args: {},
  },
  {
    name: "query_usl",
    group: "evidence",
    description: "Run ONE read-only SQL SELECT against the unified semantic layer. Returns rows with row_id and source for citation.",
    args: {
      sql: { type: "string", description: "A single SELECT statement, no trailing semicolon", required: true },
      purpose: { type: "string", description: "What you are trying to learn", required: true },
    },
  },
  {
    name: "get_dependency_path",
    group: "evidence",
    description: "Get the cross-source chain of relationships around an entity (principal, object, service, artifact...).",
    args: { entity: { type: "string", description: "Entity id as it appears in the change or the data", required: true } },
  },
  {
    name: "describe_experiments",
    group: "experiment",
    description: "List the variants, workloads, parameters and observables available for this change's world.",
    args: {},
  },
  {
    name: "run_experiment",
    group: "experiment",
    description:
      "Run the world. variant=baseline (without the change), candidate (with the change) or control (change reverted). A candidate or control run is automatically paired with a baseline under the same workload and params, so you always see the comparison.",
    args: {
      variant: { type: "string", description: "baseline | candidate | control", required: true, enum: ["baseline", "candidate", "control"] },
      observe: { type: "string[]", description: "Observable names to record (from describe_experiments)", required: true },
      workload: { type: "string", description: "Workload name (optional)" },
      params: { type: "object", description: "Parameter values. Omit to use each parameter's default (normal operation)." },
      hypothesis_ids: { type: "string[]", description: "Hypotheses this run is meant to discriminate", required: true },
      rationale: { type: "string", description: "Why this experiment is the most informative next step", required: true },
    },
  },
  {
    name: "inspect_world_model",
    group: "reasoning",
    description:
      "Read the shared world model: everything this investigation (and any earlier one) has recorded about an entity, with each link's source and row_id.",
    args: { entity: { type: "string", description: "Entity id, e.g. a principal, service or artifact", required: true } },
  },
  {
    name: "record_hypothesis",
    group: "reasoning",
    description: "Record one falsifiable consequence of the change. Cite only row_ids / experiment_ids you have retrieved.",
    args: {
      claim: { type: "string", description: "What would break or change, and where", required: true },
      mechanism: { type: "string", description: "The cross-system path by which the change causes it", required: true },
      evidence_for: { type: "string[]", description: "row_ids / experiment_ids supporting it", required: true },
      evidence_against: { type: "string[]", description: "row_ids / experiment_ids contradicting it", required: true },
      falsified_by: { type: "string", description: "The experiment result that would disprove it", required: true },
      confidence: { type: "number", description: "0 to 1", required: true },
    },
  },
  {
    name: "update_hypothesis",
    group: "reasoning",
    description: "Update a hypothesis after new evidence: change its status or add evidence.",
    args: {
      hypothesis_id: { type: "string", description: "e.g. h1", required: true },
      status: { type: "string", description: "open | supported | refuted | untested", required: true, enum: ["open", "supported", "refuted", "untested"] },
      evidence_for: { type: "string[]", description: "Additional supporting refs" },
      evidence_against: { type: "string[]", description: "Additional contradicting refs" },
      claim: { type: "string", description: "Revised claim, if the evidence changed what you believe" },
      mechanism: { type: "string", description: "Revised mechanism, if the evidence changed it" },
      note: { type: "string", description: "What changed and why", required: true },
    },
  },
  {
    name: "finish",
    group: "reasoning",
    description:
      "End the investigation with your best explanation. You do not set the verdict; a deterministic judge decides it from the experiment results.",
    args: {
      headline: { type: "string", description: "One line for the pull-request comment", required: true },
      prediction: { type: "string", description: "breaks | safe | unsure", required: true, enum: ["breaks", "safe", "unsure"] },
      cause_claim: {
        type: "string",
        description:
          "Walk the chain with the measured numbers: what the change does → which value changes (baseline → candidate, from the experiments) → which limit or contract it meets (value and the row that states it) → which check failed. If safe: the numbers that keep it within limits.",
        required: true,
      },
      evidence: {
        type: "string[]",
        description: "row_ids / experiment_ids behind your explanation, for a breaking AND a safe verdict: the specific facts (values, limits, settings) your reasoning depends on",
        required: true,
      },
      mitigation: { type: "string", description: "Required when prediction is breaks: the smallest change that would avoid the failure (shown to engineers as unverified)" },
      supported_hypothesis_ids: { type: "string[]", description: "Hypotheses your explanation rests on", required: true },
      limitations: { type: "string[]", description: "What you could not test or see", required: true },
    },
  },
];

const GROUPS_BY_MODE: Record<RunMode, Array<ToolDef["group"]>> = {
  full: ["evidence", "experiment", "reasoning"],
  no_experiments: ["evidence", "reasoning"],
  no_usl: ["experiment", "reasoning"],
  no_tools: [],
};

export function toolsFor(mode: RunMode): ToolDef[] {
  return TOOLS.filter((t) => GROUPS_BY_MODE[mode].includes(t.group));
}

export function toolSpecs(mode: RunMode, only?: string[]): ToolSpec[] {
  return toolsFor(mode).filter((t) => !only || only.includes(t.name)).map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(t.args).map(([k, a]) => [
            k,
            a.type === "string[]"
              ? { type: "array", items: { type: "string" }, description: a.description }
              : { type: a.type, description: a.description, ...(a.enum ? { enum: a.enum } : {}) },
          ]),
        ),
        required: Object.entries(t.args).filter(([, a]) => a.required).map(([k]) => k),
      },
    },
  }));
}

export class ToolError extends Error {}

function validate(def: ToolDef, args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(def.args)) {
    let value = args[key];
    if (value === undefined || value === null || value === "") {
      if (spec.required && spec.type !== "string[]") throw new ToolError(`Missing required argument "${key}"`);
      if (spec.type === "string[]") value = [];
      else continue;
    }
    if (spec.type === "string[]") {
      if (typeof value === "string") value = value.split(",").map((s) => s.trim()).filter(Boolean);
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) throw new ToolError(`"${key}" must be an array of strings`);
    } else if (spec.type === "number") {
      value = Number(value);
      if (Number.isNaN(value)) throw new ToolError(`"${key}" must be a number`);
    } else if (spec.type === "object") {
      if (typeof value === "string") value = JSON.parse(value);
      if (typeof value !== "object" || Array.isArray(value)) throw new ToolError(`"${key}" must be an object`);
    } else if (typeof value !== spec.type) {
      throw new ToolError(`"${key}" must be a ${spec.type}`);
    }
    if (spec.enum && !spec.enum.includes(String(value))) throw new ToolError(`"${key}" must be one of ${spec.enum.join(", ")}`);
    out[key] = value;
  }
  return out;
}

/** Read-only guard: exactly one SELECT/WITH statement. */
export function checkReadOnlySql(sql: string): string {
  const cleaned = sql.trim().replace(/;\s*$/, "");
  if (cleaned.includes(";")) throw new ToolError("Only one SQL statement per query");
  if (!/^(select|with)\b/i.test(cleaned)) throw new ToolError("Only read-only SELECT queries are allowed");
  if (/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|attach|pragma)\b/i.test(cleaned.replace(/'[^']*'/g, ""))) {
    throw new ToolError("Only read-only SELECT queries are allowed");
  }
  return cleaned;
}

const MAX_ROWS = 40;
const MAX_CHARS = 4_000;
const compact = (value: unknown) => {
  const text = JSON.stringify(value);
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}…(truncated)` : text;
};

export interface FinishArgs {
  headline: string;
  prediction: "breaks" | "safe" | "unsure";
  cause_claim?: string;
  evidence: string[];
  mitigation?: string;
  supported_hypothesis_ids: string[];
  limitations: string[];
}

/** "access_grant" or "db_catalog.access_grant" → the one full table name ending that way. */
export function qualifyTables(sql: string, tables: string[]): string {
  if (!tables.some((t) => t.includes("."))) return sql;
  return sql.replace(/\b(from|join)(\s+)([A-Za-z_][\w.]*)/gi, (whole, kw, sp, name: string) => {
    if (tables.includes(name)) return whole;
    const last = name.split(".").pop()!.toLowerCase();
    const matches = tables.filter((t) => t.split(".").pop()!.toLowerCase() === last);
    return matches.length === 1 ? `${kw}${sp}${matches[0]}` : whole;
  });
}

/** What changed between a baseline and another variant run, in one line the model can quote. */
export function describeDifferences(baseline: ExperimentResult, other: ExperimentResult): string {
  const keys = [...new Set([...Object.keys(baseline.observations), ...Object.keys(other.observations)])];
  const changed = keys.filter((k) => String(baseline.observations[k]) !== String(other.observations[k])).map((k) => `${k} ${baseline.observations[k] ?? "—"} → ${other.observations[k] ?? "—"}`);
  const failed = other.assertions.filter((a) => !a.passed).map((a) => `${a.name} failed (${a.detail})`);
  return [
    `baseline → ${other.request.variant}: ${changed.length ? changed.join("; ") : "no observation changed"}`,
    failed.length ? `${failed.join("; ")}${other.logs_tail ? `; log: ${other.logs_tail.slice(0, 300)}` : ""}` : `all assertions passed`,
  ].join(". ");
}

/** Numbers the experiments actually measured as different, or stated in a failing check. */
export function measuredNumbers(experiments: ExperimentResult[]): Set<number> {
  const out = new Set<number>();
  const failing = experiments.filter((x) => x.completed && x.assertions.some((a) => !a.passed));
  for (const x of failing) {
    const base = experiments.find((b) => b.request.variant === "baseline" && b.completed && JSON.stringify(b.request.params ?? {}) === JSON.stringify(x.request.params ?? {}));
    for (const [k, v] of Object.entries(x.observations)) if (!base || String(base.observations[k]) !== String(v)) for (const n of quantities(String(v))) out.add(n);
    if (base) for (const [k, v] of Object.entries(base.observations)) if (String(x.observations[k]) !== String(v)) for (const n of quantities(String(v))) out.add(n);
    for (const a of x.assertions.filter((a) => !a.passed)) for (const n of quantities(a.detail)) out.add(n);
    for (const n of quantities(x.logs_tail ?? "")) out.add(n);
  }
  return out;
}

/** Tool calls a model wrote as text ('[{"name": "finish", "parameters": {...}}]') instead of calling the tool. */
export function toolCallsFromText(content: string | null | undefined, allowed: string[]): Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> {
  if (!content) return [];
  const starts = [...content.matchAll(/[[{]/g)].map((m) => m.index!);
  for (const start of starts) {
    for (let end = content.length; end > start; end--) {
      if (content[end - 1] !== "]" && content[end - 1] !== "}") continue;
      try {
        const parsed = JSON.parse(content.slice(start, end));
        const items = (Array.isArray(parsed) ? parsed : [parsed]).filter((x) => x && allowed.includes(x.name) && typeof (x.parameters ?? x.arguments) === "object");
        if (items.length) return items.map((x, i) => ({ id: `text-call-${i}`, type: "function" as const, function: { name: x.name, arguments: JSON.stringify(x.parameters ?? x.arguments) } }));
      } catch {
        /* keep looking */
      }
    }
  }
  return [];
}

export class ToolGateway {
  queries = 0;
  experimentsRun = 0;
  finished: FinishArgs | null = null;
  dataOutages = 0;
  /** Set by the harness once it has run the minimum test itself. */
  allowFinishUntested = false;
  /** The final forced-finish attempt: accept any cited explanation rather than end the run without one. */
  lastResort = false;
  private catalogCache: ExperimentCatalog | null = null;
  private lastMitigation: string | null = null;
  private sourcesCache: Awaited<ReturnType<EvidenceAdapter["describe"]>> | null = null;
  /** Full entity ids this run has seen, for resolving short names the model uses. */
  readonly entities = new Set<string>();
  /** Statements the independent reviewer flagged; a revision must not repeat them. */
  flagged: string[] = [];
  private chainPushed = false;
  private revisionPushed = false;
  private readonly sqlSeen = new Map<string, string>();

  constructor(
    private readonly ctx: {
      mode: RunMode;
      changeId: string;
      worldId: string;
      evidence: EvidenceAdapter;
      worlds: WorldsAdapter;
      state: InvestigationState;
      world: InvestigationWorld;
      trace: TraceWriter;
      budgets: Budgets;
    },
  ) {}

  /** Execute one tool call; always returns a string for the model (errors included, so it can recover). */
  async call(name: string, rawArgs: string): Promise<string> {
    const def = toolsFor(this.ctx.mode).find((t) => t.name === name);
    if (!def) return `ERROR: tool "${name}" is not available in this run.`;
    let args: Record<string, unknown>;
    try {
      args = validate(def, rawArgs ? JSON.parse(rawArgs) : {});
    } catch (err) {
      return `ERROR: ${(err as Error).message}. Fix the arguments and call again.`;
    }
    try {
      return await this.dispatch(name, args);
    } catch (err) {
      if (err instanceof ToolError) return `ERROR: ${err.message}`;
      if ((err as Error).name === "DataLayerUnavailable") {
        this.dataOutages++;
        await this.ctx.trace.emit({ type: "error", stage: `data:${name}`, message: (err as Error).message, recoverable: true });
        return `UNAVAILABLE: the data layer did not answer (${(err as Error).message}). This is an outage, not your mistake; try again once or continue with what you have.`;
      }
      await this.ctx.trace.emit({ type: "error", stage: `tool:${name}`, message: (err as Error).message, recoverable: true });
      return `ERROR: ${(err as Error).message}`;
    }
  }

  private citations(refs: string[]): { known: string[]; unknown: string[] } {
    const known = new Set<string>();
    const unknown: string[] = [];
    for (const ref of refs) {
      if (this.ctx.state.isKnownRef(ref)) {
        known.add(ref);
        continue;
      }
      // Models sometimes send a mangled list ('["x1": baseline …, "x2": …]'): rescue the real ids inside it.
      const inside = (ref.match(/[A-Za-z0-9_./-]+/g) ?? []).filter((t) => this.ctx.state.isKnownRef(t));
      if (inside.length) for (const t of inside) known.add(t);
      else unknown.push(ref);
    }
    return { known: [...known], unknown };
  }

  private async dispatch(name: string, args: Record<string, any>): Promise<string> {
    const { evidence, worlds, state, world, trace, budgets, changeId, worldId } = this.ctx;
    switch (name) {
      case "describe_sources":
        return compact(await this.sources());

      case "query_usl": {
        if (this.queries >= budgets.max_queries) throw new ToolError("Query budget exhausted; reason with what you have or run an experiment.");
        const sql = qualifyTables(checkReadOnlySql(args.sql), (await this.sources().catch(() => [])).map((v) => v.view));
        const previous = this.sqlSeen.get(sql.replace(/\s+/g, " ").toLowerCase());
        if (previous) return `You already ran this exact query as ${previous}; use that result instead of repeating it.`;
        this.queries++;
        const result = await evidence.query(sql);
        state.recordQuery(result);
        for (const r of result.rows) for (const v of Object.values(r.values)) if (typeof v === "string" && v.startsWith(`${worldId}/`)) this.entities.add(v);
        this.sqlSeen.set(sql.replace(/\s+/g, " ").toLowerCase(), result.query_id);
        await trace.emit({ type: "usl_query", purpose: args.purpose, result });
        if (result.error) return `ERROR from semantic layer: ${result.error}`;
        return compact({ query_id: result.query_id, row_count: result.rows.length, queries_left: budgets.max_queries - this.queries, rows: result.rows.slice(0, MAX_ROWS) });
      }

      case "get_dependency_path": {
        const path = await evidence.dependencyPath(changeId, this.resolveEntity(args.entity));
        for (const n of path.nodes) {
          state.seenRows.set(n.row_id, { source: n.source, query_id: "path" });
          this.entities.add(n.id);
        }
        for (const e of path.edges) {
          for (const id of e.row_ids?.length ? e.row_ids : [e.row_id]) {
            state.seenRows.set(id, { source: e.source, query_id: "path" });
            // A path row is only known through the link it supports: say so, rather than pass the link's detail off as the row's content.
            if (!state.rowFacts.has(id)) state.rowFacts.set(id, `supports link ${e.from} ${e.relation} ${e.to}${e.detail ? ` (${e.detail})` : ""}`);
          }
        }
        await trace.emit({ type: "dependency_path", path });
        await world.recordPath(path);
        await trace.emit({ type: "memory", engine: "world_model", action: "write", detail: `Recorded ${path.nodes.length} components and ${path.edges.length} provenance-carrying links around ${args.entity}`, ref: args.entity });
        return compact(path);
      }

      case "describe_experiments":
        return compact(await this.catalog());

      case "run_experiment": {
        if (this.experimentsRun >= budgets.max_experiments) throw new ToolError("Experiment budget exhausted; finish with what you have.");
        const request: ExperimentRequest = {
          world_id: worldId,
          change_id: changeId,
          variant: args.variant,
          observe: args.observe,
          ...(args.workload ? { workload: args.workload } : {}),
          ...(args.params ? { params: args.params } : {}),
        };
        const paired: Record<string, unknown> = {};
        if (request.variant !== "baseline" && !this.hasBaseline(request)) {
          const baseline = await this.runExperiment({ ...request, variant: "baseline" }, args.hypothesis_ids, "Paired baseline: same workload and params without the change.");
          paired.baseline = baseline;
        }
        const result = await this.runExperiment(request, args.hypothesis_ids, args.rationale);
        paired[request.variant] = result;
        const baseline = (paired.baseline as typeof result | undefined) ?? (request.variant === "baseline" ? result : undefined);
        const note =
          baseline && baseline.assertions.some((a) => !a.passed)
            ? "NOTE: the baseline itself fails under these params, so they do not represent normal operation and cannot isolate the change. Re-run with default params unless you are deliberately testing a range."
            : undefined;
        const differences = baseline && request.variant !== "baseline" ? describeDifferences(baseline, result) : undefined;
        return compact({ ...(differences ? { differences } : {}), ...paired, ...(note ? { note } : {}) });
      }

      case "inspect_world_model": {
        const view = world.inspect(args.entity);
        await trace.emit({ type: "memory", engine: "world_model", action: "read", detail: `Inspected ${args.entity}: ${view.known ? `${(view.links as unknown[]).length} known links` : "nothing recorded yet"}`, ref: args.entity });
        return compact(view);
      }

      case "record_hypothesis": {
        const forRefs = this.citations(args.evidence_for);
        const againstRefs = this.citations(args.evidence_against);
        const h = state.addHypothesis({
          claim: args.claim,
          mechanism: args.mechanism,
          evidence_for: forRefs.known,
          evidence_against: againstRefs.known,
          falsified_by: args.falsified_by,
          confidence: Math.max(0, Math.min(1, args.confidence)),
        });
        await trace.emit({ type: "hypothesis", ...h });
        await world.recordHypothesis(h);
        await trace.emit({ type: "memory", engine: "world_model", action: "write", detail: `Hypothesis ${h.hypothesis_id} recorded with status ${h.status} and ${h.evidence_for.length} cited refs`, ref: h.hypothesis_id });
        const dropped = [...forRefs.unknown, ...againstRefs.unknown];
        return `Recorded ${h.hypothesis_id}.${dropped.length ? ` Ignored refs you have not retrieved: ${dropped.join(", ")}.` : ""}`;
      }

      case "update_hypothesis": {
        const current = state.hypotheses.get(args.hypothesis_id);
        if (!current) throw new ToolError(`Unknown hypothesis ${args.hypothesis_id}`);
        const forRefs = this.citations(args.evidence_for);
        const againstRefs = this.citations(args.evidence_against);
        const h = state.updateHypothesis(args.hypothesis_id, {
          status: args.status,
          ...(args.claim ? { claim: args.claim } : {}),
          ...(args.mechanism ? { mechanism: args.mechanism } : {}),
          evidence_for: [...new Set([...current.evidence_for, ...forRefs.known])],
          evidence_against: [...new Set([...current.evidence_against, ...againstRefs.known])],
        });
        await trace.emit({ type: "revision", what_changed: args.note, hypothesis_ids: [h.hypothesis_id] });
        await trace.emit({ type: "hypothesis", ...h });
        await world.recordHypothesis(h);
        await trace.emit({ type: "memory", engine: "world_model", action: "update", detail: `Hypothesis ${h.hypothesis_id} status → ${h.status} (earlier status kept as a superseded fact)`, ref: h.hypothesis_id });
        const dropped = [...forRefs.unknown, ...againstRefs.unknown];
        return `Updated ${h.hypothesis_id} → ${h.status}.${dropped.length ? ` Ignored refs you have not retrieved: ${dropped.join(", ")}.` : ""}`;
      }

      case "finish": {
        const canTest = toolsFor(this.ctx.mode).some((t) => t.name === "run_experiment") && this.experimentsRun < budgets.max_experiments;
        if (canTest && !this.allowFinishUntested && !state.experiments.some((x) => x.request.variant === "candidate" && x.completed)) {
          throw new ToolError("Test before concluding: run_experiment with variant candidate (a baseline is paired automatically) so the judge has evidence, then call finish.");
        }
        if (args.mitigation) this.lastMitigation = args.mitigation;
        else if (args.prediction === "breaks" && this.lastMitigation) args.mitigation = this.lastMitigation; // proposed in an earlier, rejected finish
        if (args.prediction === "breaks" && !args.mitigation && this.lastResort) {
          args.limitations = [...(args.limitations ?? []), "No mitigation was proposed."]; // an explanation without a fix beats none
        } else if (args.prediction === "breaks" && !args.mitigation) {
          throw new ToolError("prediction is breaks, so propose a mitigation: the smallest change that would avoid the failure. Call finish again with it.");
        }
        if (args.prediction === "breaks" && !this.chainPushed && !this.lastResort) {
          const measured = measuredNumbers(state.experiments);
          if (measured.size && !quantities(`${args.cause_claim ?? ""} ${args.headline ?? ""}`).some((n) => measured.has(n))) {
            this.chainPushed = true;
            throw new ToolError(
              `Walk the chain in cause_claim with the numbers the experiments measured (${[...measured].slice(0, 8).join(", ")}): what the change does → which value changes (baseline → candidate) → which limit or contract it meets (with the row that states it) → which check failed. Call finish again.`,
            );
          }
        }
        const text = `${args.headline ?? ""} ${args.cause_claim ?? ""} ${args.mitigation ?? ""}`;
        const repeated = this.flagged.filter((f) => (/^\d+(\.\d+)?$/.test(f) ? new RegExp(`(?<![\\w.-])${f.replace(".", "\\.")}(?![\\w-]|\\.\\d)`).test(text) : f.length >= 12 && text.includes(f)));
        if (repeated.length && !this.revisionPushed && !this.lastResort) {
          this.revisionPushed = true;
          throw new ToolError(`Your revision still contains what the reviewer flagged: ${repeated.map((r) => `"${r}"`).join(", ")}. Correct or remove exactly those statements (keep the rest), then call finish again.`);
        }
        const refs = this.citations(args.evidence);
        if (!refs.known.length) {
          throw new ToolError(
            `finish needs evidence: cite the row_ids / experiment_ids your explanation rests on.${refs.unknown.length ? ` These were never retrieved: ${refs.unknown.join(", ")}.` : ""}`,
          );
        }
        this.finished = { ...(args as FinishArgs), evidence: refs.known };
        return `Investigation closed with ${refs.known.length} cited refs.${refs.unknown.length ? ` Ignored refs you have not retrieved: ${refs.unknown.join(", ")}.` : ""} The judge will now decide the verdict from the experiment results.`;
      }
    }
    throw new ToolError(`Unhandled tool ${name}`);
  }

  /** Semantic-layer tables with their full names, fetched once per run. */
  async sources() {
    this.sourcesCache ??= await this.ctx.evidence.describe();
    return this.sourcesCache;
  }

  /** Called after the reviewer sends an explanation back. */
  setFlagged(statements: string[]) {
    this.flagged = statements.map((x) => x.trim()).filter(Boolean);
    this.revisionPushed = false;
  }

  /** "worker-runtime" → "w-k7m2/service/worker-runtime" when exactly one seen id ends that way. */
  resolveEntity(entity: string): string {
    if (entity.includes("/") || this.entities.has(entity)) return entity;
    const matches = [...this.entities].filter((id) => id.split("/").pop()?.toLowerCase() === entity.toLowerCase());
    return matches.length === 1 ? matches[0]! : entity;
  }

  /** The world's experiment catalog, fetched once per run (replays serve the recorded one). */
  async catalog(): Promise<ExperimentCatalog> {
    this.catalogCache ??= await this.ctx.worlds.catalog(this.ctx.worldId);
    return this.catalogCache;
  }

  private hasBaseline(req: ExperimentRequest): boolean {
    const key = (r: ExperimentRequest) => JSON.stringify({ w: r.workload ?? "default", p: r.params ?? {} });
    return this.ctx.state.experiments.some((x) => x.request.variant === "baseline" && x.completed && key(x.request) === key(req));
  }

  /** Shared by the model's experiments and the harness's confirmation runs. */
  async runExperiment(request: ExperimentRequest, hypothesisIds: string[], rationale: string) {
    const { worlds, state, world, trace } = this.ctx;
    this.experimentsRun++;
    const pending = `pending-${this.experimentsRun}`;
    await trace.emit({ type: "experiment_requested", experiment_id: pending, hypothesis_ids: hypothesisIds, request, rationale });
    const result = await worlds.run(request);
    state.recordExperiment(result);
    await trace.emit({ type: "experiment_result", result });
    await world.recordExperiment(result, hypothesisIds);
    return result;
  }
}

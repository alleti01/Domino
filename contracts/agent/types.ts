// Domino hand-off contracts: DRAFT v0 for the team kickoff.
// Three seams, and nothing else crosses between the three areas:
//   1. Worlds & evidence  (Anish → agent):   ChangeRequest, QueryResult, DependencyPath, ExperimentCatalog, ExperimentResult
//   2. Investigation trace (agent → Adhvik): TraceEvent (JSONL, one event per line)
//   3. Scorecard runs     (Anish ↔ agent):   InvestigateCommand, RunSummary
// Change a field only by agreement; bump CONTRACT_VERSION when you do.

export const CONTRACT_VERSION = "0.1.0";

// ───────────────────────────── 1. Worlds & evidence (Anish → agent) ─────────────────────────────

/** The proposed change Domino investigates. Neutral wording only: never names the failure. */
export interface ChangeRequest {
  change_id: string; // e.g. "chg-017"
  world_id: string; // which world the change applies to, e.g. "w-03" (opaque, neutral)
  title: string; // as a PR author would write it
  description: string;
  diff: string; // unified diff (SQL / config / code / schema)
  files: string[];
}

/** One row returned by Zetaris, with provenance so every claim can cite it. */
export interface EvidenceRow {
  row_id: string; // stable id inside its source
  source: string; // which independent source it came from, e.g. "change_log", "grant_catalog"
  values: Record<string, string>; // Zetaris returns strings
}

export interface QueryResult {
  query_id: string;
  sql: string; // exactly what ran against the USL
  rows: EvidenceRow[];
  columns: string[];
  elapsed_ms: number;
  from_snapshot: boolean; // true in sample mode (no live Zetaris)
  error?: string;
}

/** Cross-source chain the USL can establish around a changed entity. Data, not conclusions. */
export interface DependencyPath {
  change_id: string;
  nodes: Array<{ id: string; kind: string; label: string; source: string; row_id: string }>;
  edges: Array<{
    from: string;
    to: string;
    relation: string; // e.g. "grants_read_on", "feeds", "consumed_by", "bounded_by"
    status: "observed" | "inferred" | "unresolved";
    source: string;
    row_id: string;
    row_ids?: string[]; // every evidence row behind this edge (row_id is the first)
    detail?: string; // facts stated on the edge by the data layer
  }>;
  dq_issues: Array<{ rule: string; row_id: string; detail: string }>; // RUN DQ findings, shown not hidden
}

/** What can be run and observed in a world. Generic knobs only, no hints about the bug. */
export interface ExperimentCatalog {
  world_id: string;
  variants: Array<"baseline" | "candidate" | "control">;
  params: Array<{ name: string; type: "number" | "string" | "boolean"; description: string; default: string | number | boolean }>; // default = normal operation
  observables: Array<{ name: string; description: string }>; // e.g. "row_count", "artifact_entries", "consumer_exit"
  workloads: Array<{ name: string; description: string }>;
}

export interface ExperimentRequest {
  world_id: string;
  change_id: string;
  variant: "baseline" | "candidate" | "control";
  workload?: string;
  params?: Record<string, string | number | boolean>;
  observe: string[]; // subset of ExperimentCatalog.observables
  repeat?: number; // default 1
}

export interface ExperimentResult {
  experiment_id: string;
  request: ExperimentRequest;
  completed: boolean; // the world ran to the end (false = harness problem, not a finding)
  observations: Record<string, string | number | boolean>;
  assertions: Array<{ name: string; passed: boolean; detail: string }>; // the world's own runtime checks
  logs_tail: string;
  artifacts: Array<{ name: string; sha256: string; bytes: number }>;
  duration_ms: number;
}

// ───────────────────────────── 2. Investigation trace (agent → Adhvik) ─────────────────────────────

export type Verdict = "reproduced_failure" | "no_failure_observed" | "inconclusive";

interface TraceBase {
  run_id: string;
  seq: number; // strictly increasing within a run
  ts: string; // ISO time
  mode: RunMode;
  replay: boolean; // true when rendered from a recording, never pretend live
}

export type TraceEvent = TraceBase &
  (
    | { type: "run_started"; change: ChangeRequest; budgets: { max_steps: number; max_model_calls: number; max_ms: number } }
    | { type: "change_parsed"; summary: string; entities: Array<{ id: string; kind: string; source_line?: string }> }
    | { type: "usl_query"; purpose: string; result: QueryResult }
    | { type: "dependency_path"; path: DependencyPath }
    | {
        type: "hypothesis";
        hypothesis_id: string;
        claim: string; // falsifiable consequence
        mechanism: string;
        evidence_for: string[]; // row_ids / experiment_ids
        evidence_against: string[];
        falsified_by: string; // the experiment that would disprove it
        confidence: number; // 0..1, model-estimated, advisory only
        status: "open" | "supported" | "refuted" | "untested";
      }
    | { type: "experiment_requested"; experiment_id: string; hypothesis_ids: string[]; request: ExperimentRequest; rationale: string }
    | { type: "experiment_result"; result: ExperimentResult }
    | { type: "revision"; what_changed: string; hypothesis_ids: string[] }
    | { type: "memory"; engine: "world_model" | "hmem" | "markovian" | "scout_intent"; action: "write" | "read" | "update"; detail: string; ref?: string }
    | {
        type: "model_call";
        purpose: string;
        routed_model: string | null;
        provider_model: string | null;
        request_id: string | null;
        latency_ms: number;
        attempts: number;
        outcome: "ok" | "failed";
      }
    | {
        type: "verdict";
        verdict: Verdict;
        headline: string; // one line for the PR comment
        causal_chain: Array<{ edge: string; status: "observed" | "inferred"; refs: string[] }>;
        tested: string[]; // exactly what was tested
        limitations: string[];
        decided_by: "deterministic_judge"; // the model never sets the verdict
      }
    | { type: "error"; stage: string; message: string; recoverable: boolean }
    | { type: "run_finished"; duration_ms: number; model_calls: number; experiments: number }
  );

// ───────────────────────────── 3. Scorecard runs (Anish ↔ agent) ─────────────────────────────

/** A = static checks (Anish), B..E are agent modes. */
export type RunMode = "no_tools" | "no_experiments" | "full" | "no_usl";

export interface InvestigateCommand {
  change_id: string;
  mode: RunMode;
  out_dir: string; // trace.jsonl + summary.json + receipts.jsonl land here
  sample_mode?: boolean; // use snapshots instead of live Zetaris
}

export interface RunSummary {
  run_id: string;
  change_id: string;
  mode: RunMode;
  verdict: Verdict;
  cause_claim: string | null; // mechanism the agent believes, graded against hidden ground truth
  model_prediction: "breaks" | "safe" | "unsure" | null; // the model's own call (baselines B/C have no experiments to verify it)
  evidence_refs: string[];
  model_calls: number;
  experiments: number;
  duration_ms: number;
  outage: boolean; // Nightshift/Zetaris unavailable: excluded from accuracy, reported separately
  all_calls_nemotron: boolean;
}

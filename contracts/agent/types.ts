// Domino hand-off contracts: DRAFT v0 for the team kickoff.
// Three seams, and nothing else crosses between the three areas:
//   1. Worlds & evidence  (Anish → agent):   ChangeRequest, QueryResult, DependencyPath, ExperimentCatalog, ExperimentResult
//   2. Investigation trace (agent → Adhvik): TraceEvent (JSONL, one event per line)
//   3. Scorecard runs     (Anish ↔ agent):   InvestigateCommand, RunSummary
// Change a field only by agreement; bump CONTRACT_VERSION when you do.

export const CONTRACT_VERSION = "0.3.0"; // 0.2.0: ChangeRequest.source, bundle cause_chain + change.source; 0.3.0: FixVerification.trim (all additive)

// ───────────────────────────── 1. Worlds & evidence (Anish → agent) ─────────────────────────────

/** The proposed change Domino investigates. Neutral wording only: never names the failure. */
export interface ChangeRequest {
  change_id: string; // e.g. "chg-017"
  world_id: string; // which world the change applies to, e.g. "w-03" (opaque, neutral)
  title: string; // as a PR author would write it
  description: string;
  diff: string; // unified diff (SQL / config / code / schema)
  files: string[];
  source?: ChangeSource; // where the change came from, when it was not picked by hand (never shown to the model)
}

/** A pull request that Domino matched to this change (see agent/src/pr.ts). */
export interface ChangeSource {
  kind: "pull_request";
  repo: string; // "owner/name"
  number: number;
  url: string;
  title: string;
  head_sha: string;
  folder: string; // the folder of the PR that domino.json maps to this system, e.g. "orders-a/"
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
  /** Configuration the world lets an experiment override (params.overrides = { target: value }). The system's
   *  own config surface, same ids as the semantic layer; no hints. Empty when the world takes no overrides. */
  overridable?: Array<{ target: string; current: string | number | boolean; type: "number" | "string" | "boolean"; description?: string }>;
}

/** Result of applying the investigator's proposed fix inside the world and re-running (decided by code). */
export interface FixVerification {
  status: "verified" | "failed" | "untested" | "not_applicable";
  overrides: Record<string, string | number | boolean>;
  /** candidate + fix runs and baseline + fix runs, by experiment id */
  experiments: string[];
  reasons: string[];
  rounds: number;
  /** P4: after a fix held, code tested each override; `overrides` above is then only the set that is needed. */
  trim?: FixTrim;
}

export interface FixTrim {
  proposed: Record<string, string | number | boolean>; // what the investigator proposed
  not_needed: string[]; // targets dropped: the candidate passes without them and they do not fix it alone
  alternatives: string[]; // targets dropped that fix the failure on their own
  /** removes_cause: every metric the change moved returns to its baseline value; adds_headroom: some stay moved but the checks pass */
  kinds: Record<string, "removes_cause" | "adds_headroom" | "undetermined">;
  experiments: string[]; // the extra runs, by experiment id
}

export interface ExperimentRequest {
  world_id: string;
  change_id: string;
  variant: "baseline" | "candidate" | "control";
  workload?: string;
  params?: Record<string, string | number | boolean | Record<string, string | number | boolean>>; // params.overrides = { target: value } applies a fix
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
  reproduce?: string; // command that re-runs exactly this experiment
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
        causal_chain: Array<{ edge: string; status: "observed" | "inferred"; refs: string[]; detail?: string }>;
        tested: string[]; // exactly what was tested
        limitations: string[];
        decided_by: "deterministic_judge"; // the model never sets the verdict
        cause_chain?: Array<{ claim: string; cites: string[] }>; // the explanation as cited hops, checked by code
        mitigation?: string; // suggested by the model
        fix_verification?: FixVerification; // whether that fix, applied in the world, actually held
      }
    | {
        type: "review"; // independent second-model check of the explanation (never of the verdict)
        round: number;
        reviewer_model: string | null;
        approved: boolean;
        issues: Array<{ statement: string; problem: string; refs: string[] }>;
        outcome: "approved" | "sent_back" | "flagged" | "unavailable";
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
  model_failures: number; // calls that failed after the client's retries
  cache_hits: number; // calls Nightshift answered from cache (should be 0 for independent runs)
  fix?: FixVerification["status"] | null; // verified-fix outcome; null when not attempted
}

// ───────────────────────────── 4. Evidence bundle (agent → Adhvik, README, PR comment) ─────────────────────────────
// Built from a run's trace alone (so replays produce one too). Written as bundle.json + report.md.

export interface EvidenceBundle {
  bundle_version: "1";
  run_id: string;
  replay: boolean;
  mode: RunMode;
  change: { change_id: string; world_id: string; title: string; files: string[]; diff: string; source: ChangeSource | null };
  verdict: {
    verdict: Verdict;
    headline: string;
    cause: string | null; // the model's explanation (verdict itself is the judge's)
    decided_by: "deterministic_judge";
    tested: string[];
    limitations: string[];
    mitigation: { text: string; verified: boolean } | null; // verified only when fix_verification.status is "verified"
    fix_verification: FixVerification | null;
  };
  causal_chain: Array<{ edge: string; status: "observed" | "inferred"; detail: string | null; evidence: Array<{ row_id: string; facts: string }> }>;
  /** The cause as cited hops from the change to the outcome (P1/P2); each cite resolved to what it shows. */
  cause_chain: Array<{ claim: string; cites: Array<{ cite: string; refs: Array<{ ref: string; kind: "row" | "experiment"; facts: string }> }> }>;
  /** passed: every hop cited and the chain reaches the outcome; failed: kept only what was cited; absent: no chain. */
  cause_chain_check: "passed" | "failed" | "absent";
  experiments: Array<{
    experiment_id: string;
    variant: "baseline" | "candidate" | "control";
    requested_by: "agent" | "harness";
    fix_overrides: Record<string, string | number | boolean> | null; // set on fix-verification runs
    rationale: string;
    observations: Record<string, string | number | boolean>;
    failed_assertions: Array<{ name: string; detail: string }>;
    passed: boolean;
    artifacts: Array<{ name: string; sha256: string; bytes: number }>;
    reproduce: string | null;
  }>;
  hypotheses: Array<{ hypothesis_id: string; claim: string; mechanism: string; status: string; evidence_for: string[] }>;
  cited_evidence: Array<{ row_id: string; source: string; facts: string }>;
  models: {
    calls: number;
    failed: number;
    all_nemotron: boolean;
    by_model: Record<string, number>;
    request_ids: string[];
    total_latency_ms: number;
    provider: "Meterless Nightshift";
  };
  world_model: { writes: number; reads: number; updates: number };
  review: {
    reviewer_model: string | null;
    rounds: number;
    final: "approved" | "flagged" | "unavailable" | "not_run";
    issues: Array<{ round: number; statement: string; problem: string }>;
  };
  queries: number;
  duration_ms: number;
}

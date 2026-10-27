// Types for the files the dashboard reads. These mirror the files on disk;
// src/types.ts holds what the screens render.
//
// Agent output (trace, summary, bundle, receipts) follows Abhi's hand-off
// contract, contracts/agent/types.ts, CONTRACT_VERSION 0.1.0. The manifest,
// scorecard and Zetaris files are defined in docs/data-formats.md.

export const SUPPORTED_SCHEMA_MAJOR = 0

export type VerdictValue = 'reproduced_failure' | 'no_failure_observed' | 'inconclusive'
export const VERDICT_VALUES: readonly VerdictValue[] = ['reproduced_failure', 'no_failure_observed', 'inconclusive']

export type CaseKindValue = 'inspired' | 'held_out' | 'safe' | 'practice' | 'other'

/** full = Domino; the others are scorecard ablations (fewer capabilities). */
export type RunMode = 'full' | 'no_tools' | 'no_experiments' | 'no_usl'

export type Variant = 'baseline' | 'candidate' | 'control'

// ---------- Contract: worlds & evidence ----------

export interface ChangeRequest {
  change_id: string
  world_id: string
  title: string
  description: string
  diff: string
  files: string[]
}

export interface EvidenceRow {
  row_id: string
  source: string
  values: Record<string, string>
}

export interface QueryResult {
  query_id: string
  sql: string
  rows: EvidenceRow[]
  columns: string[]
  elapsed_ms: number
  from_snapshot: boolean
  error?: string
}

export interface DependencyPath {
  change_id: string
  nodes: { id: string; kind: string; label: string; source: string; row_id: string }[]
  edges: {
    from: string
    to: string
    relation: string
    status: 'observed' | 'inferred' | 'unresolved'
    source: string
    row_id: string
    row_ids?: string[]
    detail?: string
  }[]
  dq_issues: { rule: string; row_id: string; detail: string }[]
}

export interface ExperimentRequest {
  world_id: string
  change_id: string
  variant: Variant
  workload?: string
  params?: Record<string, string | number | boolean>
  observe: string[]
  repeat?: number
}

export interface ExperimentResult {
  experiment_id: string
  request: ExperimentRequest
  completed: boolean
  observations: Record<string, string | number | boolean>
  assertions: { name: string; passed: boolean; detail: string }[]
  logs_tail: string
  artifacts: { name: string; sha256: string; bytes: number }[]
  duration_ms: number
  reproduce?: string
}

// ---------- Contract: investigation trace (trace.jsonl) ----------

interface TraceBase {
  run_id: string
  seq: number
  ts: string
  mode: RunMode
  /** Rendered from a recording. The UI must say so. */
  replay: boolean
}

export interface RunStartedEvent extends TraceBase {
  type: 'run_started'
  change: ChangeRequest
  budgets: { max_steps: number; max_model_calls: number; max_ms: number }
}
export interface ChangeParsedEvent extends TraceBase {
  type: 'change_parsed'
  summary: string
  entities: { id: string; kind: string; source_line?: string }[]
}
export interface UslQueryEvent extends TraceBase {
  type: 'usl_query'
  purpose: string
  result: QueryResult
}
export interface DependencyPathEvent extends TraceBase {
  type: 'dependency_path'
  path: DependencyPath
}
export type HypothesisStatusValue = 'open' | 'supported' | 'refuted' | 'untested'
export interface HypothesisEvent extends TraceBase {
  type: 'hypothesis'
  hypothesis_id: string
  claim: string
  mechanism: string
  /** Row IDs and experiment IDs. */
  evidence_for: string[]
  evidence_against: string[]
  falsified_by: string
  /** Model-estimated, advisory only. */
  confidence: number
  status: HypothesisStatusValue
}
export interface ExperimentRequestedEvent extends TraceBase {
  type: 'experiment_requested'
  /** A pending handle; the experiment_result that follows carries the real id. */
  experiment_id: string
  hypothesis_ids: string[]
  request: ExperimentRequest
  rationale: string
}
export interface ExperimentResultEvent extends TraceBase {
  type: 'experiment_result'
  result: ExperimentResult
}
export interface RevisionEvent extends TraceBase {
  type: 'revision'
  what_changed: string
  hypothesis_ids: string[]
}
export interface MemoryEvent extends TraceBase {
  type: 'memory'
  engine: 'world_model' | 'hmem' | 'markovian' | 'scout_intent'
  action: 'write' | 'read' | 'update'
  detail: string
  ref?: string
}
export interface ModelCallEvent extends TraceBase {
  type: 'model_call'
  purpose: string
  routed_model: string | null
  provider_model: string | null
  request_id: string | null
  latency_ms: number
  attempts: number
  outcome: 'ok' | 'failed'
}
export interface VerdictEvent extends TraceBase {
  type: 'verdict'
  verdict: VerdictValue
  headline: string
  causal_chain: { edge: string; status: 'observed' | 'inferred'; refs: string[]; detail?: string }[]
  tested: string[]
  limitations: string[]
  decided_by: string
  /** Suggested by the model, never verified by Domino. */
  mitigation?: string
}
/** A second model checks the explanation against the evidence. Never the verdict. */
export interface ReviewEvent extends TraceBase {
  type: 'review'
  round: number
  reviewer_model: string | null
  approved: boolean
  issues: { statement: string; problem: string; refs: string[] }[]
  outcome: 'approved' | 'sent_back' | 'flagged' | 'unavailable'
}
export interface ErrorEvent extends TraceBase {
  type: 'error'
  stage: string
  message: string
  recoverable: boolean
}
export interface RunFinishedEvent extends TraceBase {
  type: 'run_finished'
  duration_ms: number
  model_calls: number
  experiments: number
}

export type TraceEvent =
  | RunStartedEvent
  | ChangeParsedEvent
  | UslQueryEvent
  | DependencyPathEvent
  | HypothesisEvent
  | ExperimentRequestedEvent
  | ExperimentResultEvent
  | RevisionEvent
  | MemoryEvent
  | ModelCallEvent
  | VerdictEvent
  | ReviewEvent
  | ErrorEvent
  | RunFinishedEvent

export type TraceEventType = TraceEvent['type']

// ---------- Contract: summary.json ----------

export interface RunSummary {
  run_id: string
  change_id: string
  mode: RunMode
  verdict: VerdictValue
  cause_claim: string | null
  model_prediction: 'breaks' | 'safe' | 'unsure' | null
  evidence_refs: string[]
  model_calls: number
  experiments: number
  duration_ms: number
  /** Nightshift/Zetaris unavailable: excluded from accuracy. */
  outage: boolean
  all_calls_nemotron: boolean
  model_failures?: number
  cache_hits?: number
}

// ---------- Contract: bundle.json (optional, adds facts and mitigation) ----------

export interface EvidenceBundle {
  bundle_version: string
  run_id: string
  replay: boolean
  mode: RunMode
  verdict: {
    verdict: VerdictValue
    headline: string
    cause: string | null
    decided_by: string
    tested: string[]
    limitations: string[]
    mitigation: { text: string; verified: false } | null
  }
  causal_chain: { edge: string; status: 'observed' | 'inferred'; evidence: { row_id: string; facts: string }[] }[]
  experiments: {
    experiment_id: string
    variant: Variant
    requested_by: 'agent' | 'harness'
    rationale: string
    reproduce: string | null
  }[]
  cited_evidence: { row_id: string; source: string; facts: string }[]
}

// ---------- Agent: receipts.jsonl (optional) ----------

export interface ReceiptLine {
  schema: string | null
  receiptId: string | null
  requestId: string | null
  routedModel: string | null
  providerModel: string | null
  reason: string | null
  phaseModels: string[]
  cacheStatus: string | null
  requestedModel: string
  purpose?: string
  latencyMs: number
  attempts: number
  at: string
  raw?: Record<string, unknown>
}

// ---------- Dashboard: manifest.json (optional) ----------

export interface RawCase {
  case_id: string
  label: string
  kind: CaseKindValue
  /** Optional: ground truth may stay private to the scorecard. */
  expected_verdict?: VerdictValue | null
  description?: string
  /** Agent change_ids whose runs belong to this case. */
  change_ids: string[]
}

export interface RawManifest {
  schema_version: string
  scorecard?: string
  zetaris?: string
  /** UI-only: set by the built-in placeholder source, never by real data. */
  placeholder?: boolean
  cases: RawCase[]
}

// ---------- Dashboard: scorecard.json (Anish) ----------

export interface RawScorecard {
  schema_version: string
  generated_at: string | null
  runs_included: string[]
  metrics: {
    key: string
    label: string
    value: number | null
    display: string | null
    n: number | null
    definition: string
  }[]
  cases: { case_id: string; expected_verdict: VerdictValue; runs: { run_id: string; verdict: VerdictValue }[] }[]
  baselines: {
    key: string
    label: string
    per_case: Record<string, VerdictValue | null>
    metrics: Record<string, string | null>
  }[]
}

// ---------- Dashboard: zetaris.json (Anish) ----------

export interface RawZetaris {
  schema_version: string
  compiled_at: string | null
  sources: { source_id: string; name: string; kind: string; tables: string[]; row_count: number | null; onboarded_at: string | null }[]
  usl: {
    name: string
    compile_status: 'success' | 'failed' | string
    compile_output: string
    entities: { name: string; from_sources: string[] }[]
    relationships: { from: string; to: string; via: string }[]
  }
  dq_rules: {
    rule_id: string
    name: string
    expression: string
    status: 'pass' | 'fail'
    checked_rows: number | null
    invalid_rows: { row_id: string; source: string; reason: string }[]
  }[]
}

// View model for the dashboard: what the screens render. Files on disk are
// described in src/data/format.ts; src/data/adapter.ts converts between them.

import type { RawZetaris, RunMode, Variant } from './data/format'

export type { RunMode, Variant }

export type Verdict = 'reproduced_failure' | 'no_failure_observed' | 'inconclusive'

/** outage = Nightshift or Zetaris was unavailable; excluded from accuracy. */
export type RunStatus = 'complete' | 'running' | 'failed' | 'outage'

export type CaseKind = 'inspired' | 'held_out' | 'safe' | 'practice' | 'other'

// ---------- Evidence ----------

/** Cited evidence from one source, with the IDs that open it in the panel. */
export interface SourceRef {
  source: string
  /** Row IDs for data rows; experiment or hypothesis IDs otherwise. */
  ids: string[]
}

export type EvidenceKind = 'row' | 'experiment' | 'hypothesis' | 'step'

/** Anything a claim can point to: a data row (g1), experiment (x1), hypothesis (h1) or trace step (step-12). */
export interface EvidenceItem {
  id: string
  kind: EvidenceKind
  title: string
  source: string | null
  /** Plain-language facts about a row, from the data layer or evidence bundle. */
  facts: string[]
  /** Where this was seen, e.g. the query purpose. */
  context: string[]
  fields: Record<string, unknown>
}

// ---------- Investigation sections ----------

export interface ChangeSummary {
  stepId: string
  changeId: string
  worldId: string
  title: string
  description: string
  files: string[]
  diff: string
  summary: string | null
  entities: { id: string; kind: string; sourceLine: string | null }[]
}

export type LinkStatus = 'observed' | 'inferred' | 'unresolved'

export interface GraphNode {
  id: string
  kind: string
  label: string
  refs: SourceRef[]
}

export interface GraphEdge {
  from: string
  to: string
  relation: string
  status: LinkStatus
  detail: string | null
  refs: SourceRef[]
}

/** One link of the verdict's causal chain, matched to the graph when possible. */
export interface CausalLink {
  text: string
  status: 'observed' | 'inferred'
  refs: SourceRef[]
  edge: GraphEdge | null
}

export interface DependencyChain {
  /** From the verdict: the path from the change to the failure. Empty until a verdict. */
  causal: CausalLink[]
  /** Everything the semantic layer connected around the change. */
  nodes: GraphNode[]
  edges: GraphEdge[]
  dqIssues: { rule: string; rowId: string; detail: string }[]
}

export type HypothesisStatus = 'supported' | 'refuted' | 'open' | 'untested'

export interface Hypothesis {
  id: string
  claim: string
  mechanism: string
  falsifiedBy: string
  /** Model-estimated, advisory only. */
  confidence: number | null
  status: HypothesisStatus
  /** Earlier statuses, oldest first, when the agent revised it. */
  history: HypothesisStatus[]
  evidenceFor: SourceRef[]
  evidenceAgainst: SourceRef[]
  revisions: string[]
  experimentIds: string[]
}

export type ArmOutcome = 'pass' | 'fail' | 'error'

export interface ExperimentRun {
  id: string
  stepId: string
  variant: Variant
  requestedBy: 'agent' | 'harness' | null
  hypothesisIds: string[]
  rationale: string | null
  workload: string | null
  params: Record<string, string | number | boolean>
  completed: boolean
  outcome: ArmOutcome
  observations: Record<string, string | number | boolean>
  assertions: { name: string; passed: boolean; detail: string }[]
  logs: string
  artifacts: { name: string; sha256: string; bytes: number }[]
  durationMs: number | null
  reproduce: string | null
}

export interface VerdictReport {
  verdict: Verdict
  decidedBy: string
  headline: string
  /** The model's explanation of the mechanism. The verdict itself is the judge's. */
  cause: string | null
  tested: string[]
  limitations: string[]
  /** Suggested by the model; never verified by Domino. */
  mitigation: string | null
  /** Set when the model's own wording overclaims, e.g. says "safe". */
  wordingNote: string | null
}

/** One model call through Nightshift. Never holds tokens or keys. */
export interface ModelReceipt {
  id: string
  stepId: string
  step: string
  requestedModel: string | null
  routedModel: string | null
  providerModel: string | null
  latencyMs: number | null
  attempts: number
  outcome: 'ok' | 'failed'
  receiptId: string | null
  cacheStatus: string | null
  phaseModels: string[]
}

export interface MemoryOp {
  stepId: string
  engine: string
  action: 'write' | 'read' | 'update'
  detail: string
  ref: string | null
}

export interface RunError {
  stepId: string
  stage: string
  message: string
  recoverable: boolean
}

export interface TraceStep {
  id: string
  seq: number
  offsetMs: number | null
  type: string
  title: string
  model: string | null
}

export interface Investigation {
  runId: string
  caseId: string
  caseLabel: string
  caseKind: CaseKind
  status: RunStatus
  runMode: RunMode
  /** Rendered from a recording; the UI must say so. */
  replay: boolean
  /** True while the UI is showing layout placeholders rather than a real run. */
  isPlaceholder: boolean
  startedAt: string | null
  durationMs: number | null
  change: ChangeSummary | null
  chain: DependencyChain
  hypotheses: Hypothesis[]
  experiments: ExperimentRun[]
  verdict: VerdictReport | null
  receipts: ModelReceipt[]
  memory: MemoryOp[]
  errors: RunError[]
  queries: number
  trace: TraceStep[]
  evidence: Map<string, EvidenceItem>
  warnings: string[]
}

// ---------- Site ----------

export type RunLoad =
  | { ok: true; investigation: Investigation }
  | { ok: false; error: string }

export interface RunEntry {
  runId: string
  startedAt: string
  replay: boolean
  runMode: RunMode
  status: RunStatus
  verdict: Verdict | null
  load: RunLoad
}

export interface CaseEntry {
  id: string
  label: string
  kind: CaseKind
  expectedVerdict: Verdict | null
  description: string | null
  /** Full-mode runs newest first, then ablation runs newest first. */
  runs: RunEntry[]
}

export interface ScorecardMetric {
  key: string
  label: string
  definition: string
  display: string | null
  n: number | null
}

export interface ScorecardCaseRow {
  caseId: string
  caseLabel: string
  expected: Verdict
  verdicts: Verdict[]
}

export interface ScorecardBaseline {
  key: string
  label: string
  perCase: Record<string, Verdict | null>
  metrics: Record<string, string | null>
}

export interface Scorecard {
  isPlaceholder: boolean
  generatedAt: string | null
  metrics: ScorecardMetric[]
  cases: ScorecardCaseRow[]
  baselines: ScorecardBaseline[]
}

export interface SiteData {
  isPlaceholder: boolean
  cases: CaseEntry[]
  scorecard: Scorecard | null
  zetaris: RawZetaris | null
  /** Problems with files that didn't stop the site from loading. */
  warnings: string[]
}

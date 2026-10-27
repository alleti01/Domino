// Converts parsed files into the view model. This is the only module that
// knows both shapes, so a change to the agent's contract should only touch
// here and src/data/format.ts.

import type {
  ChangeSource,
  EvidenceBundle,
  FixVerification,
  ExperimentRequestedEvent,
  RawCase,
  RawScorecard,
  ReceiptLine,
  RunSummary,
  TraceEvent,
} from './format'
import type {
  CaseEntry,
  CaseKind,
  CausalLink,
  EvidenceItem,
  ExperimentRun,
  FixCheck,
  FixStatus,
  GraphEdge,
  Hypothesis,
  HypothesisStatus,
  Investigation,
  ModelReceipt,
  PullRequestRef,
  RunEntry,
  RunStatus,
  Scorecard,
  SourceRef,
  TraceStep,
} from '../types'

export interface RunFiles {
  events: TraceEvent[]
  summary: RunSummary | null
  bundle: EvidenceBundle | null
  /** Receipts for this run's request IDs, from receipts.jsonl. */
  receipts: Map<string, ReceiptLine>
  parseWarnings: string[]
  /** report.md, when the agent wrote one. */
  reportMd?: string | null
}

export interface CaseMeta {
  caseId: string
  label: string
  kind: CaseKind
}

const stepId = (e: TraceEvent) => `step-${e.seq}`

/** "step_3" → "Step 3", "plan_experiment" → "Plan experiment". */
export function purposeLabel(purpose: string): string {
  const step = purpose.match(/^step_(\d+)$/)
  if (step) return `Reasoning step ${step[1]}`
  if (purpose === 'review') return 'Explanation review'
  const s = purpose.replace(/_/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Words the dashboard never uses for a result. If the model writes them, we
// show its text as written but say so (see the team's wording rules).
const OVERCLAIM = /\b(safe|safely|verified|guaranteed?|prevents?|prevented)\b/i

function wordingNote(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    const m = t?.match(OVERCLAIM)
    if (m) {
      return `The model's wording says "${m[0]}". Domino's verdicts only describe what was tested; none of them means the change is safe in production.`
    }
  }
  return null
}

/** The contract allows multi-line limitation strings ("- a\n- b"); show one per line. */
function splitBullets(lines: string[]): string[] {
  return lines
    .flatMap((l) => l.split('\n'))
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
}

function eventTitle(e: TraceEvent): string {
  switch (e.type) {
    case 'run_started':
      return `Started investigating: ${e.change.title}`
    case 'change_parsed':
      return 'Read the change'
    case 'usl_query':
      return e.purpose || 'Semantic layer query'
    case 'dependency_path':
      return `Found the dependency path: ${e.path.nodes.length} components, ${e.path.edges.length} links`
    case 'hypothesis':
      return `Hypothesis ${e.hypothesis_id}: ${e.status}`
    case 'experiment_requested':
      return `Asked for a ${e.request.variant} run in the sandbox`
    case 'experiment_result':
      return `${e.result.request.variant.charAt(0).toUpperCase()}${e.result.request.variant.slice(1)} run finished`
    case 'revision':
      return e.what_changed
    case 'memory':
      return e.detail
    case 'model_call':
      return `${purposeLabel(e.purpose)}${e.outcome === 'failed' ? ' (failed)' : ''}`
    case 'verdict':
      return 'Judge decided the verdict'
    case 'review':
      return `Review round ${e.round}: ${e.outcome.replace('_', ' ')}${e.issues.length ? `, ${e.issues.length} issue${e.issues.length > 1 ? 's' : ''}` : ''}`
    case 'error':
      return `Error in ${e.stage}: ${e.message}`
    case 'run_finished':
      return 'Run finished'
  }
}

// ---------- Evidence ----------

function buildEvidence(events: TraceEvent[], bundle: EvidenceBundle | null, warnings: string[]) {
  const store = new Map<string, EvidenceItem>()

  const row = (id: string, source: string): EvidenceItem => {
    let item = store.get(id)
    if (!item) {
      item = { id, kind: 'row', title: `Row ${id}`, source, facts: [], context: [], fields: {} }
      store.set(id, item)
    }
    return item
  }
  const addUnique = (list: string[], value: string | undefined | null) => {
    if (value && !list.includes(value)) list.push(value)
  }

  for (const e of events) {
    const { run_id: _r, seq: _s, ts: _t, mode: _m, replay: _p, ...fields } = e
    store.set(stepId(e), { id: stepId(e), kind: 'step', title: eventTitle(e), source: null, facts: [], context: [], fields })

    if (e.type === 'usl_query') {
      for (const r of e.result.rows) {
        const item = row(r.row_id, r.source)
        Object.assign(item.fields, r.values)
        addUnique(item.context, `Query: ${e.purpose}`)
      }
    }
    if (e.type === 'dependency_path') {
      for (const n of e.path.nodes) {
        const item = row(n.row_id, n.source)
        addUnique(item.facts, `Describes ${n.kind} "${n.label}"`)
      }
      for (const edge of e.path.edges) {
        for (const id of edge.row_ids ?? [edge.row_id]) {
          const item = row(id, edge.source)
          addUnique(item.facts, edge.detail ?? `${edge.from} ${edge.relation} ${edge.to}`)
        }
      }
    }
    if (e.type === 'experiment_result') {
      const r = e.result
      store.set(r.experiment_id, {
        id: r.experiment_id,
        kind: 'experiment',
        title: `Experiment ${r.experiment_id} (${r.request.variant})`,
        source: 'Experiments',
        facts: r.assertions.map((a) => `${a.passed ? 'Passed' : 'Failed'}: ${a.name}${a.detail ? ` (${a.detail})` : ''}`),
        context: [],
        fields: { ...r.observations, logs_tail: r.logs_tail, ...(r.reproduce ? { reproduce: r.reproduce } : {}) },
      })
    }
    if (e.type === 'hypothesis') {
      store.set(e.hypothesis_id, {
        id: e.hypothesis_id,
        kind: 'hypothesis',
        title: `Hypothesis ${e.hypothesis_id}`,
        source: 'Hypotheses',
        facts: [e.claim],
        context: [],
        fields: { status: e.status, mechanism: e.mechanism },
      })
    }
  }

  // The bundle states each cited row's facts in plain language.
  for (const c of bundle?.cited_evidence ?? []) addUnique(row(c.row_id, c.source).facts, c.facts)
  for (const link of bundle?.causal_chain ?? []) {
    for (const ev of link.evidence) {
      const existing = store.get(ev.row_id)
      if (existing) addUnique(existing.facts, ev.facts)
      else warnings.push(`Bundle cites row "${ev.row_id}" that isn't in the trace`)
    }
  }
  return store
}

/** Groups cited IDs by source so the UI can show "grant_catalog · g1, g2". */
function toRefs(ids: string[] | undefined, store: Map<string, EvidenceItem>, warnings: string[]): SourceRef[] {
  const bySource = new Map<string, SourceRef>()
  for (const id of ids ?? []) {
    const item = store.get(id)
    if (!item) warnings.push(`"${id}" is cited but never appears in the trace`)
    const source = item?.source ?? 'Not found in trace'
    const ref = bySource.get(source) ?? { source, ids: [] }
    if (!ref.ids.includes(id)) ref.ids.push(id)
    bySource.set(source, ref)
  }
  return [...bySource.values()]
}

// ---------- Investigation ----------

/** An unfinished trace with nothing new for this long is shown as stopped. */
export const STALE_MS = 11 * 60 * 1000

const FIX_STATUS: Record<FixVerification['status'], FixStatus> = {
  verified: 'held',
  failed: 'did_not_hold',
  untested: 'not_tested',
  not_applicable: 'not_applicable',
}

/** "x-3cea…: api-gateway.p99 60 (baseline)" → "x-3cea…"; a row cite is its own id. */
function citeId(cite: string) {
  const m = cite.match(/^(x-[0-9a-f]+)\b/)
  return m ? m[1] : cite.split(/\s/)[0]
}

function pullRequest(src: ChangeSource | null | undefined): PullRequestRef | null {
  if (!src || src.kind !== 'pull_request' || typeof src.number !== 'number') return null
  return { repo: src.repo, number: src.number, url: src.url, title: src.title, headSha: src.head_sha, folder: src.folder ?? null }
}

export function toInvestigation(files: RunFiles, meta: CaseMeta & { isPlaceholder: boolean }): Investigation {
  const { events, summary, receipts: receiptLines } = files
  const warnings = [...files.parseWarnings]
  const bundle = files.bundle && files.bundle.run_id === events[0]?.run_id ? files.bundle : null
  if (files.bundle && !bundle) warnings.push(`bundle.json is for run ${files.bundle.run_id}, not this run; ignored`)
  if (summary && summary.run_id !== events[0]?.run_id) warnings.push(`summary.json is for run ${summary.run_id}, not this run`)

  const evidence = buildEvidence(events, bundle, warnings)
  const refs = (ids: string[] | undefined) => toRefs(ids, evidence, warnings)
  const of = <T extends TraceEvent['type']>(type: T) =>
    events.filter((e): e is Extract<TraceEvent, { type: T }> => e.type === type)
  const last = <T extends TraceEvent['type']>(type: T) => of(type).at(-1)

  const started = last('run_started')
  const parsed = last('change_parsed')
  const finished = last('run_finished')
  const verdict = last('verdict')
  const path = last('dependency_path')?.path
  const t0 = started ? Date.parse(started.ts) : Date.parse(events[0].ts)

  // ----- Graph and causal chain -----
  const edges: GraphEdge[] = (path?.edges ?? []).map((e) => ({
    from: e.from,
    to: e.to,
    relation: e.relation,
    status: e.status,
    detail: e.detail ?? null,
    refs: refs(e.row_ids ?? [e.row_id]),
  }))
  // The verdict names components by label ("bundle-builder"), the graph by ID
  // ("w-k7m2/service/bundle-builder"), so index edges both ways.
  const labelOf = new Map((path?.nodes ?? []).map((n) => [n.id, n.label]))
  const edgeByText = new Map<string, GraphEdge>()
  for (const e of edges) {
    edgeByText.set(`${e.from} ${e.relation} ${e.to}`, e)
    edgeByText.set(`${labelOf.get(e.from) ?? e.from} ${e.relation} ${labelOf.get(e.to) ?? e.to}`, e)
  }
  const causal: CausalLink[] = (verdict?.causal_chain ?? []).map((c) => ({
    text: c.edge,
    detail: c.detail ?? null,
    status: c.status,
    refs: refs(c.refs),
    edge: edgeByText.get(c.edge) ?? null,
  }))

  // ----- Hypotheses: each event restates the hypothesis; the latest wins -----
  const hypotheses = new Map<string, Hypothesis>()
  for (const h of of('hypothesis')) {
    const prev = hypotheses.get(h.hypothesis_id)
    hypotheses.set(h.hypothesis_id, {
      id: h.hypothesis_id,
      claim: h.claim,
      mechanism: h.mechanism,
      falsifiedBy: h.falsified_by,
      confidence: typeof h.confidence === 'number' ? h.confidence : null,
      status: h.status as HypothesisStatus,
      history: prev && prev.status !== h.status ? [...prev.history, prev.status] : (prev?.history ?? []),
      evidenceFor: refs(h.evidence_for),
      evidenceAgainst: refs(h.evidence_against),
      revisions: prev?.revisions ?? [],
      experimentIds: prev?.experimentIds ?? [],
    })
  }
  for (const r of of('revision')) {
    for (const id of r.hypothesis_ids) hypotheses.get(id)?.revisions.push(r.what_changed)
  }

  // ----- Experiments: a request is answered by the next result -----
  const bundleExp = new Map((bundle?.experiments ?? []).map((x) => [x.experiment_id, x]))
  const fixRaw = verdict?.fix_verification ?? bundle?.verdict.fix_verification ?? null
  const fixIds = new Set(fixRaw?.experiments ?? [])
  const experiments: ExperimentRun[] = []
  let pending: ExperimentRequestedEvent | null = null
  for (const e of events) {
    if (e.type === 'experiment_requested') pending = e
    if (e.type !== 'experiment_result') continue
    const r = e.result
    const req = pending
    pending = null
    const hypothesisIds = req?.hypothesis_ids ?? []
    for (const id of hypothesisIds) hypotheses.get(id)?.experimentIds.push(r.experiment_id)
    const fromBundle = bundleExp.get(r.experiment_id)
    experiments.push({
      id: r.experiment_id,
      stepId: stepId(e),
      variant: r.request.variant,
      requestedBy: fromBundle?.requested_by ?? null,
      hypothesisIds,
      rationale: req?.rationale ?? fromBundle?.rationale ?? null,
      workload: r.request.workload ?? null,
      params: r.request.params ?? {},
      completed: r.completed,
      outcome: !r.completed ? 'error' : r.assertions.some((a) => !a.passed) ? 'fail' : 'pass',
      observations: r.observations ?? {},
      assertions: r.assertions ?? [],
      logs: r.logs_tail ?? '',
      artifacts: r.artifacts ?? [],
      durationMs: r.duration_ms ?? null,
      reproduce: r.reproduce ?? fromBundle?.reproduce ?? null,
      fixOverrides:
        fromBundle?.fix_overrides ??
        (fixIds.has(r.experiment_id) ? ((r.request.params?.overrides as unknown as Record<string, string | number | boolean>) ?? null) : null),
    })
  }

  // ----- Model calls, enriched from receipts.jsonl when present -----
  const receipts: ModelReceipt[] = of('model_call').map((m) => {
    const line = m.request_id ? receiptLines.get(m.request_id) : undefined
    return {
      id: m.request_id ?? `call-${m.seq}`,
      stepId: stepId(m),
      step: purposeLabel(m.purpose),
      requestedModel: line?.requestedModel ?? null,
      routedModel: m.routed_model,
      providerModel: m.provider_model,
      latencyMs: m.latency_ms,
      attempts: m.attempts,
      outcome: m.outcome,
      receiptId: line?.receiptId ?? null,
      cacheStatus: line?.cacheStatus ?? null,
      phaseModels: line?.phaseModels ?? [],
    }
  })

  // ----- Second-model review of the explanation -----
  const reviews = of('review')
  const review = reviews.length
    ? {
        reviewerModel: reviews.find((r) => r.reviewer_model)?.reviewer_model ?? null,
        rounds: reviews.length,
        outcome: reviews[reviews.length - 1].outcome,
        issues: reviews.flatMap((r) =>
          r.issues.map((i) => ({ round: r.round, statement: i.statement, problem: i.problem, refs: refs(i.refs), stepId: stepId(r) })),
        ),
      }
    : null

  // ----- Status -----
  const errors = of('error').map((e) => ({ stepId: stepId(e), stage: e.stage, message: e.message, recoverable: e.recoverable }))
  let status: RunStatus = finished ? 'complete' : 'running'
  // No run_finished and nothing written for a while: the agent stopped (CLAUDE.md §4).
  const lastTs = Date.parse(events[events.length - 1]?.ts ?? '')
  if (!finished && !Number.isNaN(lastTs) && Date.now() - lastTs > STALE_MS) status = 'stopped'
  // The agent logs an unrecoverable model error and then retries the step, so
  // an unfinished trace has only failed if it stops on such an error.
  const tail = events[events.length - 1]
  const stoppedOnError = tail?.type === 'error' && !tail.recoverable
  if (errors.some((e) => !e.recoverable) && !verdict && (finished || stoppedOnError)) status = 'failed'
  if (summary?.outage) status = 'outage'

  // ----- Trace -----
  let model: string | null = null
  const trace: TraceStep[] = events.map((e) => {
    if (e.type === 'model_call') model = e.routed_model
    const ts = Date.parse(e.ts)
    const shownModel =
      e.type === 'review'
        ? e.reviewer_model
        : e.type === 'model_call' || e.type === 'hypothesis' || e.type === 'experiment_requested' || e.type === 'revision'
          ? model
          : null
    return {
      id: stepId(e),
      seq: e.seq,
      offsetMs: Number.isNaN(t0) || Number.isNaN(ts) ? null : ts - t0,
      type: e.type,
      title: eventTitle(e),
      // Steps that act on a model's answer show which model gave it.
      model: shownModel,
    }
  })

  if (summary && verdict && summary.verdict !== verdict.verdict) {
    warnings.push(`summary.json says "${summary.verdict}" but the trace's verdict is "${verdict.verdict}"`)
  }
  if (verdict && verdict.decided_by !== 'deterministic_judge') {
    warnings.push(`The verdict was decided by "${verdict.decided_by}", not the deterministic judge`)
  }

  const cause = bundle?.verdict.cause ?? summary?.cause_claim ?? null

  // ----- Fix check: re-runs with the suggested fix applied -----
  const fix: FixCheck | null = fixRaw
    ? {
        status: FIX_STATUS[fixRaw.status] ?? 'not_tested',
        overrides: fixRaw.overrides ?? {},
        experimentIds: fixRaw.experiments ?? [],
        reasons: fixRaw.reasons ?? [],
        rounds: fixRaw.rounds ?? 0,
      }
    : null

  // ----- Cause chain: claims with their cited evidence -----
  type RawStep = { claim: string; cites: (string | { cite: string; refs: { ref: string }[] })[] }
  const rawChain: RawStep[] = bundle?.cause_chain ?? verdict?.cause_chain ?? []
  const causeChain = rawChain.map((step) => {
    const cites = step.cites.map((c) => (typeof c === 'string' ? c : c.cite))
    const ids = step.cites.flatMap((c) => (typeof c === 'string' ? [citeId(c)] : c.refs.map((r) => r.ref)))
    return { claim: step.claim, cites, refs: refs([...new Set(ids)]) }
  })
  const chainCheck = bundle?.cause_chain_check
  const causeChainOk = chainCheck == null ? null : chainCheck === 'passed'
  const mitigation = verdict?.mitigation ?? bundle?.verdict.mitigation?.text ?? null

  return {
    runId: events[0].run_id,
    caseId: meta.caseId,
    caseLabel: meta.label,
    caseKind: meta.kind,
    status,
    runMode: events[0].mode,
    replay: events.some((e) => e.replay),
    isPlaceholder: meta.isPlaceholder,
    startedAt: started?.ts ?? events[0].ts,
    lastEventAt: events[events.length - 1]?.ts ?? null,
    reportMd: files.reportMd ?? null,
    durationMs: finished?.duration_ms ?? summary?.duration_ms ?? null,
    change: started
      ? {
          stepId: stepId(started),
          changeId: started.change.change_id,
          worldId: started.change.world_id,
          title: started.change.title,
          description: started.change.description,
          files: started.change.files ?? [],
          diff: started.change.diff ?? '',
          summary: parsed?.summary ?? null,
          entities: (parsed?.entities ?? []).map((x) => ({ id: x.id, kind: x.kind, sourceLine: x.source_line ?? null })),
          pullRequest: pullRequest(started.change.source),
        }
      : null,
    chain: {
      causal,
      nodes: (path?.nodes ?? []).map((n) => ({ id: n.id, kind: n.kind, label: n.label, refs: refs([n.row_id]) })),
      edges,
      dqIssues: (path?.dq_issues ?? []).map((d) => ({ rule: d.rule, rowId: d.row_id, detail: d.detail })),
    },
    hypotheses: [...hypotheses.values()],
    experiments,
    verdict: verdict
      ? {
          verdict: verdict.verdict,
          decidedBy: verdict.decided_by,
          headline: verdict.headline,
          cause,
          tested: verdict.tested,
          limitations: splitBullets(verdict.limitations),
          mitigation,
          fix,
          causeChain,
          causeChainOk,
          wordingNote: wordingNote(verdict.headline, cause),
        }
      : null,
    review,
    receipts,
    memory: of('memory').map((m) => ({ stepId: stepId(m), engine: m.engine, action: m.action, detail: m.detail, ref: m.ref ?? null })),
    errors,
    queries: of('usl_query').length,
    trace,
    evidence,
    warnings: [...new Set(warnings)],
  }
}

// ---------- Cases ----------

/** Full-mode runs first (newest first), then ablation runs (newest first). */
export function sortRuns(runs: RunEntry[]): RunEntry[] {
  return [...runs].sort(
    (a, b) => Number(a.runMode !== 'full') - Number(b.runMode !== 'full') || b.startedAt.localeCompare(a.startedAt),
  )
}

export function toCaseEntry(raw: RawCase, runs: RunEntry[]): CaseEntry {
  return {
    id: raw.case_id,
    label: raw.label,
    kind: raw.kind,
    expectedVerdict: raw.expected_verdict ?? null,
    description: raw.description ?? null,
    runs: sortRuns(runs),
  }
}

// ---------- Scorecard ----------

export function toScorecard(raw: RawScorecard, cases: CaseEntry[], isPlaceholder: boolean): Scorecard {
  const label = (id: string) => cases.find((c) => c.id === id)?.label ?? id
  return {
    isPlaceholder,
    generatedAt: raw.generated_at,
    metrics: raw.metrics.map((m) => ({
      key: m.key,
      label: m.label,
      definition: m.definition,
      display: m.display ?? (m.value != null ? String(m.value) : null),
      n: m.n ?? null,
    })),
    cases: raw.cases.map((c) => ({
      caseId: c.case_id,
      caseLabel: label(c.case_id),
      expected: c.expected_verdict,
      verdicts: c.runs.map((r) => r.verdict),
    })),
    baselines: raw.baselines.map((b) => ({ key: b.key, label: b.label, perCase: b.per_case, metrics: b.metrics })),
  }
}

/** Shown on Results when there's no scorecard file yet: nothing measured. */
export function emptyScorecard(isPlaceholder: boolean): Scorecard {
  return { isPlaceholder, generatedAt: null, metrics: [], cases: [], baselines: [] }
}

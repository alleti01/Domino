// Layout placeholders written in the agent's real trace format (contract
// v0.1.0), so the parser and adapter run on them exactly as on real runs.
// Every value is filler; the manifest's placeholder flag makes the UI say so.

import type { RawManifest, RawScorecard, RawZetaris, RunMode, Variant, VerdictValue } from './format'

const MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b'

interface RunSpec {
  runId: string
  changeId: string
  title: string
  startedAt: string
  mode: RunMode
  verdict: VerdictValue
}

function iso(base: string, seconds: number) {
  return new Date(Date.parse(base) + seconds * 1000).toISOString()
}

function traceLines(spec: RunSpec): string[] {
  const out: object[] = []
  let seq = 0
  let calls = 0
  const add = (fields: Record<string, unknown>) => {
    seq += 1
    out.push({ run_id: spec.runId, seq, ts: iso(spec.startedAt, seq * 3), mode: spec.mode, replay: false, ...fields })
  }
  const call = (purpose: string) => {
    calls += 1
    add({
      type: 'model_call',
      purpose,
      routed_model: MODEL,
      provider_model: MODEL,
      request_id: `req_${spec.runId}_${calls}`,
      latency_ms: 0,
      attempts: 1,
      outcome: 'ok',
    })
  }
  const memory = (action: string, detail: string, ref?: string) =>
    add({ type: 'memory', engine: 'world_model', action, detail, ...(ref ? { ref } : {}) })

  add({
    type: 'run_started',
    change: {
      change_id: spec.changeId,
      world_id: 'placeholder-world',
      title: spec.title,
      description: 'Placeholder description written as a PR author would.',
      diff: '--- a/path/to/file\n+++ b/path/to/file\n@@\n unchanged placeholder line\n+added placeholder line\n',
      files: ['path/to/file'],
    },
    budgets: { max_steps: 20, max_model_calls: 24, max_ms: 600000 },
  })
  add({
    type: 'change_parsed',
    summary: 'Placeholder summary of what the change touches.',
    entities: [{ id: 'entity-a', kind: 'principal', source_line: '+added placeholder line' }],
  })
  memory('read', 'Placeholder: components recalled from earlier investigations')
  call('step_1')
  add({
    type: 'dependency_path',
    path: {
      change_id: spec.changeId,
      nodes: [
        { id: 'entity-a', kind: 'principal', label: 'Placeholder entity A', source: 'source_a', row_id: 'a1' },
        { id: 'service-b', kind: 'service', label: 'Placeholder service B', source: 'source_b', row_id: 'b1' },
        { id: 'artifact-c', kind: 'artifact', label: 'Placeholder artifact C', source: 'source_b', row_id: 'b2' },
        { id: 'consumer-d', kind: 'service', label: 'Placeholder consumer D', source: 'source_c', row_id: 'c1' },
        { id: 'limit-e', kind: 'limit', label: 'Placeholder limit E', source: 'source_c', row_id: 'c2' },
      ],
      edges: [
        { from: 'entity-a', to: 'service-b', relation: 'identity_of', status: 'observed', source: 'source_b', row_id: 'b1' },
        { from: 'service-b', to: 'artifact-c', relation: 'produces', status: 'observed', source: 'source_b', row_id: 'b2' },
        { from: 'artifact-c', to: 'consumer-d', relation: 'consumed_by', status: 'inferred', source: 'source_c', row_id: 'c1' },
        { from: 'consumer-d', to: 'limit-e', relation: 'bounded_by', status: 'observed', source: 'source_c', row_id: 'c2' },
      ],
      dq_issues: [{ rule: 'Placeholder rule: references resolve', row_id: 'c9', detail: 'Placeholder broken link, shown not hidden' }],
    },
  })
  memory('write', 'Placeholder: recorded components and links', 'entity-a')
  call('step_2')
  add({
    type: 'usl_query',
    purpose: 'Placeholder query purpose',
    result: {
      query_id: 'q1',
      sql: 'SELECT placeholder FROM placeholder_view',
      rows: [{ row_id: 'b1', source: 'source_b', values: { field: 'placeholder' } }],
      columns: ['field'],
      elapsed_ms: 0,
      from_snapshot: true,
    },
  })
  call('step_3')
  const hypothesis = (status: string, evidence_for: string[], evidence_against: string[]) =>
    add({
      type: 'hypothesis',
      hypothesis_id: 'h1',
      claim: 'Placeholder hypothesis: what might break, and why.',
      mechanism: 'Placeholder mechanism: entity A → service B → artifact C → consumer D.',
      evidence_for,
      evidence_against,
      falsified_by: 'Placeholder: the experiment that would disprove it.',
      confidence: 0.5,
      status,
    })
  hypothesis('open', ['b1', 'b2'], [])
  memory('write', 'Placeholder: hypothesis h1 recorded', 'h1')

  if (spec.mode !== 'no_experiments') {
    const runs: [Variant, boolean, boolean][] =
      spec.verdict === 'reproduced_failure'
        ? [['baseline', true, true], ['candidate', true, false], ['candidate', true, false], ['control', true, true]]
        : spec.verdict === 'no_failure_observed'
          ? [['baseline', true, true], ['candidate', true, true], ['control', true, true]]
          : [['baseline', true, true], ['candidate', false, false]]
    runs.forEach(([variant, completed, passed], i) => {
      call(`step_${4 + i}`)
      add({
        type: 'experiment_requested',
        experiment_id: `pending-${i + 1}`,
        hypothesis_ids: i < 2 ? ['h1'] : [],
        request: { world_id: 'placeholder-world', change_id: spec.changeId, variant, observe: ['metric_a'], workload: 'standard' },
        rationale: `Placeholder rationale for the ${variant} run.`,
      })
      add({
        type: 'experiment_result',
        result: {
          experiment_id: `x${i + 1}`,
          request: { world_id: 'placeholder-world', change_id: spec.changeId, variant, observe: ['metric_a'], workload: 'standard' },
          completed,
          observations: completed ? { 'service-b.metric_a': '—', 'consumer-d.status': '—' } : {},
          assertions: completed ? [{ name: 'consumer-d.loads_input', passed, detail: 'placeholder' }] : [],
          logs_tail: completed ? `[placeholder] ${variant} log output` : '[placeholder] harness did not finish',
          artifacts: [],
          duration_ms: 0,
        },
      })
    })
  }

  const final = spec.verdict === 'reproduced_failure' ? 'supported' : spec.verdict === 'inconclusive' ? 'open' : 'refuted'
  if (final !== 'open') {
    add({ type: 'revision', what_changed: 'Placeholder: what the results changed.', hypothesis_ids: ['h1'] })
    hypothesis(final, final === 'supported' ? ['b1', 'b2', 'x2'] : ['b1'], final === 'refuted' ? ['x2'] : ['x1'])
    memory('update', `Placeholder: hypothesis h1 status → ${final}`, 'h1')
  }
  if (spec.verdict === 'inconclusive') {
    add({ type: 'error', stage: 'experiment', message: 'Placeholder: the candidate run did not complete', recoverable: true })
  }
  add({
    type: 'verdict',
    verdict: spec.verdict,
    headline: 'Placeholder headline sentence with the key finding.',
    causal_chain:
      spec.verdict === 'reproduced_failure'
        ? [
            { edge: 'entity-a identity_of service-b', status: 'observed', refs: ['b1'] },
            { edge: 'service-b produces artifact-c', status: 'observed', refs: ['b2'] },
            { edge: 'artifact-c consumed_by consumer-d', status: 'inferred', refs: ['c1'] },
          ]
        : [],
    tested: ['Placeholder: which runs and workloads were tested.'],
    limitations: ['- Placeholder: what the test environment does not mirror.\n- Placeholder: what was not tested.'],
    decided_by: 'deterministic_judge',
    ...(spec.verdict === 'reproduced_failure' ? { mitigation: 'Placeholder mitigation suggested by the model.' } : {}),
  })
  add({ type: 'run_finished', duration_ms: 0, model_calls: calls, experiments: spec.mode === 'no_experiments' ? 0 : 3 })
  return out.map((e) => JSON.stringify(e))
}

const CASES: {
  id: string
  label: string
  kind: 'inspired' | 'held_out' | 'safe'
  expected: VerdictValue
  shown: VerdictValue
  runs: RunMode[]
}[] = [
  { id: 'cloudflare', label: 'Cloudflare-inspired', kind: 'inspired', expected: 'reproduced_failure', shown: 'reproduced_failure', runs: ['full', 'full', 'no_experiments'] },
  { id: 'crowdstrike', label: 'CrowdStrike-inspired', kind: 'inspired', expected: 'reproduced_failure', shown: 'reproduced_failure', runs: ['full', 'full'] },
  // Shown as inconclusive so every verdict state has a placeholder.
  { id: 'surprise', label: 'Surprise case', kind: 'held_out', expected: 'reproduced_failure', shown: 'inconclusive', runs: ['full'] },
  { id: 'safe', label: 'Safe change', kind: 'safe', expected: 'no_failure_observed', shown: 'no_failure_observed', runs: ['full', 'full'] },
]

function buildFiles(): Map<string, string> {
  const files = new Map<string, string>()
  const manifest: RawManifest = { schema_version: '0.2', placeholder: true, cases: [] }

  CASES.forEach((c, ci) => {
    const changeId = `placeholder-${c.id}`
    c.runs.forEach((mode, i) => {
      const runId = `run-placeholder-${c.id}-${i + 1}`
      const startedAt = `2026-10-24T${String(9 + ci).padStart(2, '0')}:${String(i * 10).padStart(2, '0')}:00.000Z`
      const verdict = mode === 'no_experiments' ? 'inconclusive' : c.shown
      const spec = { runId, changeId, title: 'Placeholder pull request title', startedAt, mode, verdict }
      files.set(`runs/${runId}/trace.jsonl`, traceLines(spec).join('\n'))
    })
    manifest.cases.push({
      case_id: c.id,
      label: c.label,
      kind: c.kind,
      expected_verdict: c.expected,
      description: 'Placeholder description of the mechanism this case simulates.',
      change_ids: [changeId],
    })
  })
  files.set('manifest.json', JSON.stringify(manifest))

  const scorecard: RawScorecard = {
    schema_version: '0.1',
    generated_at: null,
    runs_included: [],
    metrics: [
      ['failure_recall', 'Failure recall', 'Dangerous changes detected / all dangerous changes'],
      ['false_positive_rate', 'False positive rate', 'Safe changes flagged / all safe changes'],
      ['reproduction_rate', 'Reproduction rate', 'Warnings backed by a repeatable failing experiment'],
      ['causal_correctness', 'Causal correctness', 'Findings naming the actual mechanism'],
      ['median_runtime_ms', 'Median runtime', 'Per investigation, end to end'],
      ['model_calls_per_case', 'Model calls per case', 'Median Nightshift calls per investigation'],
    ].map(([key, label, definition]) => ({ key, label, definition, value: null, display: null, n: null })),
    cases: [],
    baselines: [],
  }
  files.set('scorecard.json', JSON.stringify(scorecard))

  const zetaris: RawZetaris = {
    schema_version: '0.1',
    compiled_at: null,
    sources: ['a', 'b', 'c'].map((x) => ({
      source_id: `source_${x}`,
      name: `source_${x}`,
      kind: 'placeholder',
      tables: [],
      row_count: null,
      onboarded_at: null,
    })),
    usl: {
      name: 'placeholder_usl',
      compile_status: 'success',
      compile_output: 'Placeholder COMPILE USL output.',
      entities: [],
      relationships: [],
    },
    dq_rules: [
      {
        rule_id: 'dq1',
        name: 'Placeholder rule: references resolve',
        expression: 'placeholder',
        status: 'fail',
        checked_rows: null,
        invalid_rows: [{ row_id: 'c9', source: 'source_c', reason: 'placeholder' }],
      },
    ],
  }
  files.set('zetaris.json', JSON.stringify(zetaris))
  return files
}

let cache: Map<string, string> | null = null

export function placeholderFiles(): Map<string, string> {
  cache ??= buildFiles()
  return cache
}

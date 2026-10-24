// Parses and validates the dashboard's input files. Validation is deliberately
// shallow: it catches the mistakes that would otherwise render a blank or
// misleading page, and names the file, line and field at fault.

import { LoadError } from './errors'
import {
  SUPPORTED_SCHEMA_MAJOR,
  VERDICT_VALUES,
  type EvidenceBundle,
  type RawManifest,
  type RawScorecard,
  type RawZetaris,
  type ReceiptLine,
  type RunSummary,
  type TraceEvent,
  type TraceEventType,
} from './format'

type Obj = Record<string, unknown>
type Kind = 'string' | 'number' | 'boolean' | 'array' | 'object'

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function need(obj: Obj, key: string, kind: Kind, where: string) {
  const v = obj[key]
  const ok = kind === 'array' ? Array.isArray(v) : kind === 'object' ? isObj(v) : typeof v === kind
  if (!ok) throw new LoadError(`${where}: "${key}" should be ${kind === 'array' || kind === 'object' ? `an ${kind}` : `a ${kind}`}`)
}

function parseJson(text: string, file: string): unknown {
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new LoadError(`${file}: not valid JSON (${(e as Error).message})`)
  }
}

function parseObject(text: string, file: string): Obj {
  const data = parseJson(text, file)
  if (!isObj(data)) throw new LoadError(`${file}: expected a JSON object`)
  return data
}

export function checkSchemaVersion(version: unknown, file: string) {
  if (typeof version !== 'string') throw new LoadError(`${file}: missing "schema_version"`)
  const major = Number(version.split('.')[0])
  if (major !== SUPPORTED_SCHEMA_MAJOR) {
    throw new LoadError(
      `${file}: schema_version ${version} isn't supported by this dashboard (expects ${SUPPORTED_SCHEMA_MAJOR}.x)`,
    )
  }
}

function checkVerdict(v: unknown, where: string) {
  if (!VERDICT_VALUES.includes(v as never)) {
    throw new LoadError(`${where}: verdict "${String(v)}" must be one of ${VERDICT_VALUES.join(', ')}`)
  }
}

/** One JSON object per line; blank lines are ignored. */
function parseLines(text: string, file: string): { value: Obj; where: string }[] {
  const items: { value: Obj; where: string }[] = []
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return
    const where = `${file} line ${i + 1}`
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      throw new LoadError(`${where}: not valid JSON`)
    }
    if (!isObj(value)) throw new LoadError(`${where}: expected an object`)
    items.push({ value, where })
  })
  return items
}

// ---------- manifest.json ----------

export function parseManifest(text: string, file = 'manifest.json'): RawManifest {
  const data = parseObject(text, file)
  checkSchemaVersion(data.schema_version, file)
  need(data, 'cases', 'array', file)
  const ids = new Set<string>()
  ;(data.cases as unknown[]).forEach((c, i) => {
    const where = `${file} cases[${i}]`
    if (!isObj(c)) throw new LoadError(`${where}: expected an object`)
    for (const k of ['case_id', 'label', 'kind'] as const) need(c, k, 'string', where)
    need(c, 'change_ids', 'array', where)
    if (c.expected_verdict != null) checkVerdict(c.expected_verdict, where)
    if (ids.has(c.case_id as string)) throw new LoadError(`${where}: duplicate case_id "${c.case_id}"`)
    ids.add(c.case_id as string)
  })
  return data as unknown as RawManifest
}

// ---------- trace.jsonl ----------

// Required fields per event type, beyond run_id/seq/ts/type (contract v0.1.0).
const REQUIRED: Record<TraceEventType, [string, Kind][]> = {
  run_started: [['change', 'object']],
  change_parsed: [['summary', 'string'], ['entities', 'array']],
  usl_query: [['purpose', 'string'], ['result', 'object']],
  dependency_path: [['path', 'object']],
  hypothesis: [['hypothesis_id', 'string'], ['claim', 'string'], ['status', 'string'], ['evidence_for', 'array'], ['evidence_against', 'array']],
  experiment_requested: [['experiment_id', 'string'], ['request', 'object']],
  experiment_result: [['result', 'object']],
  revision: [['what_changed', 'string'], ['hypothesis_ids', 'array']],
  memory: [['engine', 'string'], ['action', 'string'], ['detail', 'string']],
  model_call: [['purpose', 'string'], ['latency_ms', 'number'], ['outcome', 'string']],
  verdict: [['verdict', 'string'], ['headline', 'string'], ['causal_chain', 'array'], ['tested', 'array'], ['limitations', 'array'], ['decided_by', 'string']],
  error: [['stage', 'string'], ['message', 'string']],
  run_finished: [['duration_ms', 'number']],
}

export interface ParsedTrace {
  events: TraceEvent[]
  /** Problems that didn't stop the run from rendering, e.g. unknown event types. */
  warnings: string[]
}

export function parseTrace(text: string, file: string): ParsedTrace {
  const warnings: string[] = []
  const events: TraceEvent[] = []
  let runId: string | null = null
  const seqs = new Set<number>()

  for (const { value, where } of parseLines(text, file)) {
    need(value, 'type', 'string', where)
    need(value, 'seq', 'number', where)
    need(value, 'ts', 'string', where)
    need(value, 'run_id', 'string', where)
    const type = value.type as string
    if (!(type in REQUIRED)) {
      warnings.push(`${where}: unknown event type "${type}" was skipped`)
      continue
    }
    for (const [key, kind] of REQUIRED[type as TraceEventType]) need(value, key, kind, `${where} (${type})`)
    if (type === 'verdict') checkVerdict(value.verdict, where)
    if (type === 'experiment_result') need(value.result as Obj, 'request', 'object', `${where} (experiment_result.result)`)
    if (type === 'usl_query') need(value.result as Obj, 'rows', 'array', `${where} (usl_query.result)`)
    if (type === 'dependency_path') {
      need(value.path as Obj, 'nodes', 'array', `${where} (dependency_path.path)`)
      need(value.path as Obj, 'edges', 'array', `${where} (dependency_path.path)`)
    }

    runId ??= value.run_id as string
    if (value.run_id !== runId) throw new LoadError(`${where}: run_id "${value.run_id}" differs from "${runId}"`)
    if (seqs.has(value.seq as number)) throw new LoadError(`${where}: duplicate seq ${value.seq}`)
    seqs.add(value.seq as number)
    events.push(value as unknown as TraceEvent)
  }

  if (events.length === 0) throw new LoadError(`${file}: no events`)
  events.sort((a, b) => a.seq - b.seq)
  if (events[0].type !== 'run_started') warnings.push(`${file}: first event isn't run_started`)
  return { events, warnings }
}

// ---------- summary.json, bundle.json, receipts.jsonl (all optional) ----------

export function parseSummary(text: string, file: string): RunSummary {
  const data = parseObject(text, file)
  need(data, 'run_id', 'string', file)
  checkVerdict(data.verdict, file)
  return data as unknown as RunSummary
}

export function parseBundle(text: string, file: string): EvidenceBundle {
  const data = parseObject(text, file)
  need(data, 'run_id', 'string', file)
  need(data, 'verdict', 'object', file)
  if (!Array.isArray(data.cited_evidence)) data.cited_evidence = []
  if (!Array.isArray(data.experiments)) data.experiments = []
  if (!Array.isArray(data.causal_chain)) data.causal_chain = []
  return data as unknown as EvidenceBundle
}

export function parseReceipts(text: string, file: string): ReceiptLine[] {
  return parseLines(text, file).map(({ value }) => value as unknown as ReceiptLine)
}

// ---------- scorecard.json, zetaris.json ----------

export function parseScorecard(text: string, file = 'scorecard.json'): RawScorecard {
  const data = parseObject(text, file)
  checkSchemaVersion(data.schema_version, file)
  need(data, 'metrics', 'array', file)
  need(data, 'cases', 'array', file)
  if (!Array.isArray(data.baselines)) data.baselines = []
  if (!Array.isArray(data.runs_included)) data.runs_included = []
  return data as unknown as RawScorecard
}

export function parseZetaris(text: string, file = 'zetaris.json'): RawZetaris {
  const data = parseObject(text, file)
  checkSchemaVersion(data.schema_version, file)
  need(data, 'sources', 'array', file)
  need(data, 'usl', 'object', file)
  need(data, 'dq_rules', 'array', file)
  return data as unknown as RawZetaris
}

// Everything the landing page shows, derived from saved runs. Nothing here is
// typed in by hand: when the saved runs change, the page changes with them.

import type { CaseEntry, Investigation, SiteData } from '../../../types'
import type { LoopData } from './Loop'
import { VERDICT, isNemotron } from '../../../lib/labels'
import { experimentSummary, flagship, showcases, type Showcase } from '../../../lib/showcase'
import { cap, plainMeasure, plainSource, plainTitle, plainUnit } from './plain'

export interface CaseCard {
  id: string
  title: string
  label: string
  verdict: 'reproduced_failure' | 'no_failure_observed' | 'inconclusive' | null
  verdictLabel: string
  baseline: string
  candidate: string
  measure: string
  /** A short noun for the measure, e.g. "records read". */
  unit: string
  limit: number | null
  failed: boolean
  runs: number
  agreeing: number
}

const plain = (key: string) => {
  const words = (key.split('.').pop() ?? key).replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const fmt = (v: unknown) => (v == null ? 'n/a' : String(v))

export function caseCards(cases: CaseEntry[]): CaseCard[] {
  return showcases(cases).map(({ caseEntry, inv }) => {
    const x = experimentSummary(inv)
    const verdicts = caseEntry.runs.map((r) => r.verdict).filter(Boolean)
    const latest = inv.verdict?.verdict ?? null
    return {
      id: caseEntry.id,
      title: plainTitle(inv.change?.title ?? caseEntry.label),
      label: caseEntry.label,
      verdict: latest,
      verdictLabel: latest === 'reproduced_failure' ? 'Reproduced failure' : latest === 'no_failure_observed' ? 'No failure observed' : latest ? VERDICT[latest].label : 'No verdict',
      baseline: fmt(x?.baseline),
      candidate: fmt(x?.candidate),
      measure: x ? cap(plainMeasure(x.key)) : 'Open the report',
      unit: x ? plainUnit(x.key) : '',
      limit: x?.limit?.value ?? null,
      failed: latest === 'reproduced_failure',
      runs: verdicts.length,
      agreeing: verdicts.filter((v) => v === latest).length,
    }
  })
}

/* ---------- The terminal replay (middle section 1) ---------- */

export type Line =
  | { kind: 'user'; text: string; code?: string }
  | { kind: 'agent'; text: string }
  | { kind: 'tool'; rows: { text: string; tone?: 'pass' | 'fail' }[] }

export interface ReplayStep {
  label: string
  status: string
  typing: string
  lines: Line[]
}

const sentence = (text: string | null | undefined, max = 190) => {
  if (!text) return ''
  const first = text.split(/(?<=[.!?])\s/)[0] ?? text
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first
}

const shortModel = (m: string | null) => (m ? (m.split('/').pop() ?? m) : 'second model')

export function replay(inv: Investigation): ReplayStep[] {
  const change = inv.change
  const plus = change?.diff.split('\n').find((l) => l.startsWith('+') && !l.startsWith('+++'))?.slice(1).trim()
  const queries = inv.trace.filter((t) => t.type === 'usl_query').map((t) => t.title)
  const systems = [...new Set(inv.chain.nodes.flatMap((n) => n.refs.map((r) => r.source)))].filter(Boolean)
  const supported = inv.hypotheses.find((h) => h.status === 'supported') ?? inv.hypotheses[0]
  const x = experimentSummary(inv)
  const key = x?.key
  const runs = inv.experiments.filter((e) => e.completed)
  const v = inv.verdict
  const review = inv.review
  const calls = inv.receipts.length
  const nemotron = inv.receipts.filter((r) => isNemotron(r.routedModel ?? '')).length

  return [
    {
      label: 'A change is proposed',
      status: 'reading',
      typing: change?.title ?? 'Proposed change',
      lines: [{ kind: 'user', text: change?.title ?? 'A proposed change', ...(plus ? { code: plus } : {}) }],
    },
    {
      label: 'Domino maps the systems',
      status: 'querying',
      typing: queries[0] ?? 'Query the semantic layer',
      lines: [
        {
          kind: 'tool',
          rows: [
            ...queries.slice(0, 3).map((q) => ({ text: `query · ${q.toLowerCase()}` })),
            { text: `${queries.length} queries · ${inv.chain.nodes.length} components · ${systems.length} systems` },
          ],
        },
        { kind: 'agent', text: `Joined what ${systems.length} systems know about this change: ${systems.map((s) => s.replace(/_/g, ' ')).join(', ')}.` },
      ],
    },
    {
      label: 'Domino suspects a link',
      status: 'thinking',
      typing: 'Form a testable hypothesis',
      lines: [
        { kind: 'tool', rows: [{ text: `hypothesis ${supported?.id ?? ''} · ${supported?.status ?? 'open'}` }] },
        { kind: 'agent', text: sentence(supported?.claim) || 'A hypothesis to test.' },
      ],
    },
    {
      label: 'Domino tests it',
      status: 'testing',
      typing: 'Run baseline, candidate and control',
      lines: [
        {
          kind: 'tool',
          rows: runs.slice(0, 4).map((r) => {
            const failed = r.assertions.find((a) => !a.passed)
            return {
              text: `${r.variant.padEnd(9, ' ')} ${key ? `${plain(key).toLowerCase()} ${fmt(r.observations[key])}` : ''} · ${failed ? `failed ${failed.name}` : 'passed'}`,
              tone: failed ? ('fail' as const) : ('pass' as const),
            }
          }),
        },
      ],
    },
    {
      label: 'Code decides',
      status: v?.verdict === 'reproduced_failure' ? 'reproduced' : 'decided',
      typing: 'Judge the runs',
      lines: [
        { kind: 'tool', rows: [{ text: `judge · ${v ? VERDICT[v.verdict].label.toLowerCase() : 'no verdict'}`, tone: v?.verdict === 'reproduced_failure' ? 'fail' : 'pass' }] },
        { kind: 'agent', text: sentence(v?.cause ?? v?.headline, 220) || 'No explanation recorded.' },
        {
          kind: 'tool',
          rows: [
            { text: `review · ${review?.outcome ?? 'not run'} by ${shortModel(review?.reviewerModel ?? null)}` },
            { text: `${nemotron}/${calls} model calls on nvidia nemotron` },
          ],
        },
      ],
    },
  ]
}

/* ---------- The particle story (middle section 2) ---------- */

export interface FlowData {
  sources: string[]
  baseline: number | null
  candidate: number | null
  limit: number | null
  measure: string
  failed: boolean
}

export function flowData(inv: Investigation | null): FlowData {
  if (!inv) return { sources: ['change records', 'pipeline repo', 'runtime config', 'db catalog'], baseline: null, candidate: null, limit: null, measure: '', failed: false }
  const x = experimentSummary(inv)
  const num = (v: unknown) => (typeof v === 'number' ? v : Number.isFinite(Number(v)) ? Number(v) : null)
  return {
    sources: [...new Set(inv.chain.nodes.flatMap((n) => n.refs.map((r) => r.source)))].filter(Boolean).map((s) => s.replace(/_/g, ' ')),
    baseline: num(x?.baseline),
    candidate: num(x?.candidate),
    limit: x?.limit?.value ?? null,
    measure: x ? cap(plainMeasure(x.key)) : '',
    failed: !!x?.candidateFailed,
  }
}

export function featured(cases: CaseEntry[]): Showcase | null {
  return flagship(cases)
}

/* ---------- The loop canvas (middle section 2) ---------- */


export function loopData(site: SiteData): LoopData {
  const shows = showcases(site.cases)
  // Source systems, ranked by how many components they hold across every run.
  const bySource = new Map<string, Set<string>>()
  for (const { inv } of shows)
    for (const n of inv.chain.nodes)
      for (const r of n.refs) {
        const set = bySource.get(r.source) ?? new Set<string>()
        set.add(n.label)
        bySource.set(r.source, set)
      }
  const sources = [...bySource]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 3)
    .map(([name, items]) => ({ name: cap(plainSource(name)), items: [...items] }))
  const num = (v: unknown) => (typeof v === 'number' ? v : Number.isFinite(Number(v)) ? Number(v) : 0)
  const lanes = shows.slice(0, 5).map(({ caseEntry, inv }) => {
    const x = experimentSummary(inv)
    const rows = Math.max(1, num(x?.baseline))
    const extra = x?.candidateFailed ? Math.max(0, num(x?.candidate) - rows) : 0
    return { name: caseEntry.label, rows, extra, runs: Math.max(1, caseEntry.runs.length) }
  })
  const lead = flagship(site.cases)
  const x = lead ? experimentSummary(lead.inv) : null
  return {
    sources: sources.length ? sources : [{ name: 'Change records', items: [] }],
    lanes,
    baseline: num(x?.baseline) || 100,
    candidate: num(x?.candidate) || 160,
    limit: x?.limit?.value ?? null,
    measure: x ? cap(plainMeasure(x.key)) : '',
    failed: !!x?.candidateFailed,
  }
}

/* ---------- Measured facts for the results and stack sections ---------- */

export interface SiteFacts {
  worlds: number
  runs: number
  /** Worlds whose every recorded run reached the same verdict. */
  steady: number
  reproduced: number
  noFailure: number
  inconclusive: number
  calls: number
  /** Calls that reached a model (the rest failed at the provider and were retried). */
  answeredCalls: number
  failedCalls: number
  nemotronCalls: number
  medianCalls: number | null
  medianSeconds: number | null
  approved: number
  flagged: number
  reviewUnavailable: number
  /** Source systems the semantic layer joined, most used first. */
  sources: string[]
  investigator: string | null
  reviewer: string | null
}

const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Short model names: "nvidia/nemotron-3.5-lightning-30b-a3b" → "Nemotron 3.5 Lightning". */
export function modelName(id: string | null) {
  if (!id) return null
  const m = (id.split('/').pop() ?? id).match(/^nemotron-([\d.]+)-([a-z]+)/i)
  return m ? `Nemotron ${m[1]} ${m[2].charAt(0).toUpperCase()}${m[2].slice(1)}` : (id.split('/').pop() ?? id)
}

export function siteFacts(site: SiteData): SiteFacts {
  const invs: Investigation[] = []
  let steady = 0
  for (const c of site.cases) {
    const ok = c.runs.flatMap((r) => (r.load.ok ? [r.load.investigation] : []))
    invs.push(...ok)
    const vs = new Set(ok.map((i) => i.verdict?.verdict ?? null))
    if (ok.length > 0 && vs.size === 1) steady++
  }
  const count = (v: string) => invs.filter((i) => i.verdict?.verdict === v).length
  const receipts = invs.flatMap((i) => i.receipts)
  const byModel = new Map<string, number>()
  for (const r of receipts) if (r.routedModel) byModel.set(r.routedModel, (byModel.get(r.routedModel) ?? 0) + 1)
  const reviewers = new Map<string, number>()
  for (const i of invs) if (i.review?.reviewerModel) reviewers.set(i.review.reviewerModel, (reviewers.get(i.review.reviewerModel) ?? 0) + 1)
  const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const reviewer = top(reviewers)
  const investigator = top(new Map([...byModel].filter(([k]) => k !== reviewer))) ?? top(byModel)
  const sourceUse = new Map<string, number>()
  for (const i of invs) for (const n of i.chain.nodes) for (const r of n.refs) if (r.source) sourceUse.set(r.source, (sourceUse.get(r.source) ?? 0) + 1)
  return {
    worlds: site.cases.length,
    runs: invs.length,
    steady,
    reproduced: count('reproduced_failure'),
    noFailure: count('no_failure_observed'),
    inconclusive: count('inconclusive'),
    calls: receipts.length,
    answeredCalls: receipts.filter((r) => r.outcome === 'ok').length,
    failedCalls: receipts.filter((r) => r.outcome !== 'ok').length,
    nemotronCalls: receipts.filter((r) => r.outcome === 'ok' && isNemotron(r.routedModel ?? '')).length,
    medianCalls: median(invs.map((i) => i.receipts.length)),
    medianSeconds: median(invs.flatMap((i) => (i.durationMs != null ? [i.durationMs / 1000] : []))),
    approved: invs.filter((i) => i.review?.outcome === 'approved').length,
    flagged: invs.filter((i) => i.review?.outcome === 'flagged').length,
    reviewUnavailable: invs.filter((i) => !i.review || (i.review.outcome !== 'approved' && i.review.outcome !== 'flagged')).length,
    sources: [...sourceUse].sort((a, b) => b[1] - a[1]).map(([s]) => plainSource(s)),
    investigator: modelName(investigator),
    reviewer: modelName(reviewer),
  }
}

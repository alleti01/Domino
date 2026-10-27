// Everything the landing page shows, derived from saved runs. Nothing here is
// typed in by hand: when the saved runs change, the page changes with them.

import type { CaseEntry, Investigation, SiteData } from '../../../types'
import type { LoopData } from './Loop'
import { VERDICT, isNemotron } from '../../../lib/labels'
import { experimentSummary, flagship, showcases, type Showcase } from '../../../lib/showcase'

export interface CaseCard {
  id: string
  title: string
  label: string
  verdict: 'reproduced_failure' | 'no_failure_observed' | 'inconclusive' | null
  verdictLabel: string
  baseline: string
  candidate: string
  measure: string
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
      title: inv.change?.title ?? caseEntry.label,
      label: caseEntry.label,
      verdict: latest,
      verdictLabel: latest === 'reproduced_failure' ? 'Reproduced failure' : latest === 'no_failure_observed' ? 'No failure observed' : latest ? VERDICT[latest].label : 'No verdict',
      baseline: fmt(x?.baseline),
      candidate: fmt(x?.candidate),
      measure: x ? plain(x.key) : 'Open the report',
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
    measure: x ? plain(x.key) : '',
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
    .map(([name, items]) => ({ name: name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), items: [...items] }))
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
    measure: x ? plain(x.key) : '',
    failed: !!x?.candidateFailed,
  }
}

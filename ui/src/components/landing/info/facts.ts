// Figures for the info pages and the top nav's visuals, counted from the
// recorded runs: which sources the semantic layer cited, which models answered
// and how fast, what the World Model held, and the flagship run's three
// sandbox runs (without the change, with it, and with it undone).

import type { Investigation, SiteData } from '../../../types'
import { experimentSummary, flagship } from '../../../lib/showcase'
import { modelName, siteFacts, stackCounts, type SiteFacts } from '../giga/data'
import { plainMeasure, plainSource, plainTitle } from '../giga/plain'

export interface InfoFacts {
  site: SiteFacts
  queries: number
  sources: { name: string; uses: number }[]
  models: { id: string; name: string; calls: number; medianMs: number | null; reviewer: boolean }[]
  memory: { write: number; update: number; read: number; total: number }
  receipts: { step: string; model: string; ms: number | null; ok: boolean }[]
  change: string
  runs: {
    measure: string
    without: number
    with: number
    undone: number | null
    limit: { name: string; value: number } | null
    broke: string | null
    failed: boolean
    /** The fixed check that failed, in words, e.g. "runtime starts with bundle". */
    check: string | null
    detail: string | null
  } | null
}

const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[s.length >> 1]
}

export function infoFacts(site: SiteData): InfoFacts {
  const invs: Investigation[] = site.cases.flatMap((c) => c.runs.flatMap((r) => (r.load.ok ? [r.load.investigation] : [])))
  const f = siteFacts(site)
  const n = stackCounts(site)

  const src = new Map<string, number>()
  for (const i of invs) for (const node of i.chain.nodes) for (const ref of node.refs) if (ref.source) src.set(ref.source, (src.get(ref.source) ?? 0) + 1)
  const sources = [...src].sort((a, b) => b[1] - a[1]).map(([s, uses]) => ({ name: plainSource(s), uses }))

  const reviewerIds = new Set(invs.flatMap((i) => (i.review?.reviewerModel ? [i.review.reviewerModel] : [])))
  const byModel = new Map<string, { calls: number; ms: number[] }>()
  for (const i of invs)
    for (const r of i.receipts) {
      if (r.outcome !== 'ok' || !r.routedModel) continue
      const m = byModel.get(r.routedModel) ?? { calls: 0, ms: [] }
      m.calls++
      if (r.latencyMs != null) m.ms.push(r.latencyMs)
      byModel.set(r.routedModel, m)
    }
  const models = [...byModel]
    .sort((a, b) => b[1].calls - a[1].calls)
    .map(([id, m]) => ({ id, name: modelName(id) ?? id, calls: m.calls, medianMs: median(m.ms), reviewer: [...reviewerIds].some((r) => id.endsWith(r) || r.endsWith(id)) }))

  const memory = { write: 0, update: 0, read: 0, total: 0 }
  for (const i of invs)
    for (const m of i.memory) {
      memory[m.action]++
      memory.total++
    }

  const fl = flagship(site.cases)
  const receipts = (fl?.inv.receipts ?? []).slice(0, 4).map((r) => ({
    step: r.step,
    model: modelName(r.routedModel) ?? 'No model',
    ms: r.latencyMs,
    ok: r.outcome === 'ok',
  }))

  const ex = fl ? experimentSummary(fl.inv) : null
  const num = (v: unknown) => (typeof v === 'number' ? v : null)
  const runs =
    ex && num(ex.baseline) != null && num(ex.candidate) != null
      ? {
          measure: plainMeasure(ex.key),
          without: num(ex.baseline)!,
          with: num(ex.candidate)!,
          undone: num(ex.control),
          limit: ex.limit && ex.limit.value != null ? { name: ex.limit.name, value: ex.limit.value } : null,
          broke: ex.limit ? ex.limit.name.split('.')[0] : null,
          failed: ex.candidateFailed,
          check: ex.failure ? ex.failure.split(':')[0].replace(/_/g, ' ') : null,
          detail: ex.failure && ex.failure.includes(':') ? ex.failure.slice(ex.failure.indexOf(':') + 1).trim() : null,
        }
      : null

  return {
    site: f,
    queries: n.queries,
    sources,
    models,
    memory,
    receipts,
    change: plainTitle(fl?.inv.change?.title),
    runs,
  }
}

export const secs = (ms: number | null) => (ms == null ? '–' : `${(ms / 1000).toFixed(1)}s`)

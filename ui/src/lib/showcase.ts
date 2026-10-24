// Picks what the landing page shows and shapes it for display. Everything is
// derived from saved runs, so the page updates itself when real runs land.

import type { CaseEntry, EvidenceItem, Investigation, LinkStatus } from '../types'

export interface Showcase {
  caseEntry: CaseEntry
  inv: Investigation
}

/** Cases whose latest run loaded, in manifest order. */
export function showcases(cases: CaseEntry[]): Showcase[] {
  return cases.flatMap((c) => {
    const r = c.runs[0]
    return r?.load.ok ? [{ caseEntry: c, inv: r.load.investigation }] : []
  })
}

/** The run the tour is built around: the first one that reproduced a failure, else the first that loaded. */
export function flagship(cases: CaseEntry[]): Showcase | null {
  const all = showcases(cases)
  return all.find((s) => s.inv.verdict?.verdict === 'reproduced_failure') ?? all[0] ?? null
}

export interface ChainTile {
  id: string
  kind: string
  label: string
  sources: string[]
  /** Link from the previous tile into this one; null for the first tile. */
  link: { relation: string; status: LinkStatus; fromGraph: boolean } | null
}

/**
 * The causal chain as a row of tiles: change → … → what broke. If the last
 * component is bounded by a limit in the dependency graph, the limit is added
 * as a final tile (marked as coming from the graph, not the verdict).
 */
export function chainTiles(inv: Investigation): ChainTile[] {
  const nodes = new Map(inv.chain.nodes.map((n) => [n.id, n]))
  const tile = (id: string, link: ChainTile['link']): ChainTile => {
    const n = nodes.get(id)
    return { id, kind: n?.kind ?? 'component', label: n?.label ?? id, sources: n?.refs.map((r) => r.source) ?? [], link }
  }
  const edges = inv.chain.causal.flatMap((l) => (l.edge ? [{ ...l.edge, status: l.status }] : []))
  if (edges.length === 0) return []
  const tiles = [tile(edges[0].from, null)]
  for (const e of edges) tiles.push(tile(e.to, { relation: e.relation, status: e.status, fromGraph: false }))

  const last = tiles[tiles.length - 1].id
  const bound = inv.chain.edges.find((e) => e.from === last && /bound|limit/i.test(e.relation))
  if (bound && !tiles.some((t) => t.id === bound.to)) {
    tiles.push(tile(bound.to, { relation: bound.relation, status: bound.status, fromGraph: true }))
  }
  return tiles
}

export interface ExperimentSummary {
  key: string
  baseline: string | number | boolean | null
  candidate: string | number | boolean | null
  control: string | number | boolean | null
  candidateFailed: boolean
  /** What the failing check said, e.g. "load rejected". */
  failure: string | null
  limit: { name: string; value: number | null; evidenceId: string | null } | null
}

const firstNumber = (text: string) => {
  const m = text.match(/=\s*(-?\d+(?:\.\d+)?)\b/) ?? text.match(/(-?\d+(?:\.\d+)?)\s*$/)
  return m ? Number(m[1]) : null
}

/** The limit the chain runs into, with its value only if a cited row states it. */
function findLimit(inv: Investigation): ExperimentSummary['limit'] {
  const node = inv.chain.nodes.find((n) => n.kind === 'limit' && inv.chain.edges.some((e) => e.to === n.id && /bound|limit/i.test(e.relation)))
  if (!node) return null
  for (const id of node.refs.flatMap((r) => r.ids)) {
    const item: EvidenceItem | undefined = inv.evidence.get(id)
    for (const fact of item?.facts ?? []) {
      if (!fact.toLowerCase().includes(node.label.toLowerCase())) continue
      const value = firstNumber(fact)
      if (value != null) return { name: node.label, value, evidenceId: id }
    }
  }
  return { name: node.label, value: null, evidenceId: node.refs[0]?.ids[0] ?? null }
}

/** Baseline vs candidate vs control for the observation that changed most visibly. */
export function experimentSummary(inv: Investigation): ExperimentSummary | null {
  const pick = (variant: string, failing = false) =>
    inv.experiments.find((x) => x.variant === variant && x.completed && (!failing || x.outcome === 'fail')) ??
    inv.experiments.find((x) => x.variant === variant && x.completed)
  const baseline = pick('baseline')
  const candidate = pick('candidate', true)
  if (!baseline || !candidate) return null
  const keys = Object.keys(candidate.observations)
  const numeric = keys.find(
    (k) => typeof candidate.observations[k] === 'number' && candidate.observations[k] !== baseline.observations[k],
  )
  const key = numeric ?? keys.find((k) => candidate.observations[k] !== baseline.observations[k]) ?? keys[0]
  if (!key) return null
  const control = pick('control')
  const failed = candidate.assertions.find((a) => !a.passed)
  return {
    key,
    baseline: baseline.observations[key] ?? null,
    candidate: candidate.observations[key] ?? null,
    control: control?.observations[key] ?? null,
    candidateFailed: candidate.outcome === 'fail',
    failure: failed ? `${failed.name}${failed.detail ? `: ${failed.detail}` : ''}` : null,
    limit: findLimit(inv),
  }
}

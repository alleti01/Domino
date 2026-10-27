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

// How the data layer links a component to the limit it runs into.
const LIMIT_RELATION = /bound|limit|configured_with/i
const LIMIT_NAME = /max|limit|cap|threshold|quota/i
type NodeIndex = Map<string, { kind: string; label: string }>
const isLimitNode = (nodes: NodeIndex, id: string) => {
  const n = nodes.get(id)
  return !!n && (n.kind === 'limit' || (n.kind === 'setting' && LIMIT_NAME.test(n.label)))
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
  const bound = inv.chain.edges.find((e) => e.from === last && LIMIT_RELATION.test(e.relation) && isLimitNode(nodes, e.to))
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

/** "max_entries=200" or "max_items = 50" → 200 / 50. */
const statedNumber = (text: string | null | undefined) => {
  const m = text?.match(/=\s*(-?\d+(?:\.\d+)?)\b/)
  return m ? Number(m[1]) : null
}

/**
 * The limit the chain runs into, with its value only if the data states it:
 * on the link to the limit (e.g. detail "max_entries=200") or in a cited row's facts.
 */
function findLimit(inv: Investigation): ExperimentSummary['limit'] {
  const nodes: NodeIndex = new Map(inv.chain.nodes.map((n) => [n.id, n]))
  const links = [
    ...inv.chain.causal.flatMap((l) => (l.edge ? [{ to: l.edge.to, relation: l.edge.relation, detail: l.detail ?? l.edge.detail, refs: l.refs }] : [])),
    ...inv.chain.edges.map((e) => ({ to: e.to, relation: e.relation, detail: e.detail, refs: e.refs })),
  ].filter((l) => LIMIT_RELATION.test(l.relation) && isLimitNode(nodes, l.to))
  if (links.length === 0) return null
  const name = nodes.get(links[0].to)?.label ?? links[0].to
  for (const l of links) {
    const value = statedNumber(l.detail)
    if (value != null) return { name, value, evidenceId: l.refs[0]?.ids[0] ?? null }
  }
  const node = inv.chain.nodes.find((n) => n.id === links[0].to)
  for (const id of node?.refs.flatMap((r) => r.ids) ?? []) {
    const item: EvidenceItem | undefined = inv.evidence.get(id)
    for (const fact of item?.facts ?? []) {
      const value = fact.toLowerCase().includes(name.toLowerCase()) ? statedNumber(fact) : null
      if (value != null) return { name, value, evidenceId: id }
    }
  }
  return { name, value: null, evidenceId: node?.refs[0]?.ids[0] ?? null }
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

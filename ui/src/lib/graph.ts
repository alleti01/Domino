// The dependency map as Domino draws it: the semantic-layer graph around a
// change, with the verdict's path (when there is one) picked out, laid out in
// columns by dependency depth so the path runs straight through the middle.

import type { Investigation, LinkStatus, SourceRef } from '../types'
import { chainTiles } from './showcase'

export interface MapNode {
  id: string
  label: string
  kind: string
  refs: SourceRef[]
  isChange: boolean
  /** Position on the verdict's path, from 0 (the change); null when off the path. */
  step: number | null
}

export interface MapEdge {
  id: string
  from: string
  to: string
  relation: string
  status: LinkStatus
  detail: string | null
  refs: SourceRef[]
  onPath: boolean
  /** On the path, but added from the surrounding graph rather than the verdict's own chain. */
  fromGraph: boolean
}

export interface InvestigationMap {
  nodes: MapNode[]
  edges: MapEdge[]
  /** Node IDs of the verdict's path in order; empty when the verdict names none. */
  path: string[]
}

const edgeId = (from: string, to: string, relation: string) => `${from}|${relation}|${to}`

/** The graph the run retrieved, with the verdict's path marked on it. */
export function investigationMap(inv: Investigation): InvestigationMap {
  const tiles = chainTiles(inv)
  const path = tiles.map((t) => t.id)
  const step = new Map(path.map((id, i) => [id, i]))
  const nodes: MapNode[] = inv.chain.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    kind: n.kind,
    refs: n.refs,
    isChange: n.kind === 'change',
    step: step.get(n.id) ?? null,
  }))
  for (const t of tiles) {
    if (!nodes.some((n) => n.id === t.id)) {
      nodes.push({ id: t.id, label: t.label, kind: t.kind, refs: [], isChange: t.kind === 'change', step: step.get(t.id) ?? null })
    }
  }

  const edges: MapEdge[] = inv.chain.edges.map((e) => ({
    id: edgeId(e.from, e.to, e.relation),
    from: e.from,
    to: e.to,
    relation: e.relation,
    status: e.status,
    detail: e.detail,
    refs: e.refs,
    onPath: false,
    fromGraph: false,
  }))
  tiles.slice(1).forEach((t, i) => {
    const from = tiles[i].id
    const link = t.link!
    const causal = inv.chain.causal.find((l) => l.edge && l.edge.from === from && l.edge.to === t.id)
    const existing = edges.find((e) => e.from === from && e.to === t.id && e.relation === link.relation)
    // On the path, the verdict's own status and citations for the link take precedence.
    const onPath = {
      status: link.status,
      onPath: true,
      fromGraph: link.fromGraph,
      detail: causal?.detail ?? existing?.detail ?? null,
      refs: causal?.refs.length ? causal.refs : (existing?.refs ?? []),
    }
    if (existing) Object.assign(existing, onPath)
    else edges.push({ id: edgeId(from, t.id, link.relation), from, to: t.id, relation: link.relation, ...onPath })
  })
  return { nodes, edges, path }
}

/** Only the verdict's path: its components and the links between them. */
export function pathOnly(map: InvestigationMap): InvestigationMap {
  const on = new Set(map.path)
  return { nodes: map.nodes.filter((n) => on.has(n.id)), edges: map.edges.filter((e) => e.onPath), path: map.path }
}

export interface Placed {
  layer: number
  row: number
}

export interface Layout {
  at: Map<string, Placed>
  layers: number
  minRow: number
  maxRow: number
}

/**
 * Columns by longest dependency depth from the graph's roots, rows so the
 * main line (the verdict's path, or else the longest chain, for layout only)
 * sits on row 0 and everything else branches above and below it, near the
 * components it connects to.
 */
export function layoutMap(map: InvestigationMap): Layout {
  const ids = map.nodes.map((n) => n.id)
  const known = new Set(ids)
  const edges = map.edges.filter((e) => known.has(e.from) && known.has(e.to) && e.from !== e.to)
  const parents = new Map(ids.map((id) => [id, [] as string[]]))
  const children = new Map(ids.map((id) => [id, [] as string[]]))
  for (const e of edges) {
    parents.get(e.to)!.push(e.from)
    children.get(e.from)!.push(e.to)
  }

  // Longest-path layering; the pass limit keeps a cycle from looping forever.
  const layer = new Map(ids.map((id) => [id, 0]))
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false
    for (const e of edges) {
      const next = Math.min(layer.get(e.from)! + 1, ids.length - 1)
      if (next > layer.get(e.to)!) {
        layer.set(e.to, next)
        changed = true
      }
    }
    if (!changed) break
  }

  let line = map.path.filter((id) => known.has(id))
  if (line.length === 0 && ids.length > 0) {
    // Follow the deepest component back to a root, one layer at a time.
    let at = ids.reduce((a, b) => (layer.get(b)! > layer.get(a)! ? b : a))
    line = [at]
    while (layer.get(at)! > 0) {
      const up = parents.get(at)!.find((p) => layer.get(p) === layer.get(at)! - 1)
      if (!up) break
      line.unshift(up)
      at = up
    }
  }

  const row = new Map<string, number>()
  const taken = new Map<number, Set<number>>()
  const take = (id: string, r: number) => {
    row.set(id, r)
    const l = layer.get(id)!
    if (!taken.has(l)) taken.set(l, new Set())
    taken.get(l)!.add(r)
  }
  for (const id of line) take(id, 0)

  const order = ids.filter((id) => !row.has(id)).sort((a, b) => layer.get(a)! - layer.get(b)! || ids.indexOf(a) - ids.indexOf(b))
  let side = -1
  for (const id of order) {
    const near = [...parents.get(id)!, ...children.get(id)!].filter((n) => row.has(n)).map((n) => row.get(n)!)
    const want = near.length ? near.reduce((a, b) => a + b, 0) / near.length : 0
    const used = taken.get(layer.get(id)!) ?? new Set<number>()
    // Nearest free row to where its neighbours are, leaning away from the main line.
    const lean = want === 0 ? side : Math.sign(want)
    const base = Math.round(want)
    const tries = [base]
    for (let d = 1; d <= ids.length; d++) tries.push(base + lean * d, base - lean * d)
    take(id, tries.find((r) => !used.has(r) && r !== 0) ?? base + lean * (ids.length + 1))
    if (want === 0) side = -side
  }

  const rows = [...row.values()]
  return {
    at: new Map(ids.map((id) => [id, { layer: layer.get(id)!, row: row.get(id)! }])),
    layers: Math.max(1, ...ids.map((id) => layer.get(id)! + 1)),
    minRow: rows.length ? Math.min(...rows) : 0,
    maxRow: rows.length ? Math.max(...rows) : 0,
  }
}

/** Splits a dotted or snake_case name into lines of at most `max` characters, breaking after separators. */
export function wrapName(name: string, max: number, lines = 3): string[] {
  const parts = name.split(/(?<=[._:/-])/)
  const out: string[] = []
  let cur = ''
  for (let p of parts) {
    while (p.length > max) {
      if (cur) out.push(cur)
      out.push(p.slice(0, max))
      p = p.slice(max)
      cur = ''
    }
    if ((cur + p).length > max && cur) {
      out.push(cur)
      cur = p
    } else cur += p
  }
  if (cur) out.push(cur)
  if (out.length > lines) return [...out.slice(0, lines - 1), `${out[lines - 1].slice(0, max - 1)}…`]
  return out
}

const KIND_ABBR: Record<string, string> = {
  change: 'CHG',
  service: 'SVC',
  principal: 'PRN',
  database: 'DB',
  table: 'TBL',
  query: 'QRY',
  artifact: 'ART',
  setting: 'SET',
  interface: 'IFC',
  component: 'CMP',
}

/** A short code for a component kind, drawn on the tile's narrow half. */
export const kindCode = (kind: string) => KIND_ABBR[kind] ?? kind.slice(0, 3).toUpperCase()

// ---------- Shared selection ----------

export type MapSelection = { type: 'node' | 'edge'; id: string }

/** The selection still valid in `map`, or the map's own default: the first doubtful path link, else the change. */
export function resolveSelection(map: InvestigationMap, picked: MapSelection | null): MapSelection {
  const ok = (s: MapSelection | null) =>
    !!s && (s.type === 'node' ? map.nodes.some((n) => n.id === s.id) : map.edges.some((e) => e.id === s.id))
  if (ok(picked)) return picked!
  const doubt = map.edges.find((e) => e.onPath && e.status !== 'observed')
  if (doubt) return { type: 'edge', id: doubt.id }
  return { type: 'node', id: map.path[0] ?? map.nodes.find((n) => n.isChange)?.id ?? map.nodes[0]?.id ?? '' }
}

/** What a selection lights up: the selected item, its links, and the components at their ends. */
export function selectionFocus(map: InvestigationMap, sel: MapSelection) {
  const edges = new Set(sel.type === 'edge' ? [sel.id] : map.edges.filter((e) => e.from === sel.id || e.to === sel.id).map((e) => e.id))
  const nodes = new Set(map.edges.filter((e) => edges.has(e.id)).flatMap((e) => [e.from, e.to]))
  if (sel.type === 'node') nodes.add(sel.id)
  return { nodes, edges }
}

// ---------- Guided walkthrough ----------

export interface WalkStep {
  edge: MapEdge
  from: MapNode
  to: MapNode
  /** One line grounded in the link's own status and citations. */
  note: string
}

/** The verdict's path, one link at a time. Empty when the verdict names no path. */
export function walkSteps(map: InvestigationMap): WalkStep[] {
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  return map.path.slice(1).flatMap((id, i) => {
    const edge = map.edges.find((e) => e.onPath && e.from === map.path[i] && e.to === id)
    const from = byId.get(map.path[i])
    const to = byId.get(id)
    if (!edge || !from || !to) return []
    const rows = edge.refs.reduce((n, r) => n + r.ids.length, 0)
    const cited = rows > 0 ? `${rows} supporting row${rows === 1 ? '' : 's'} cited` : 'no supporting row cited'
    const note =
      edge.status === 'observed'
        ? `Observed: read directly from the retrieved data (${cited}).`
        : edge.status === 'inferred'
          ? `Inferred: proposed from the surrounding evidence, not stated in a retrieved row (${cited}).`
          : `Unresolved: the evidence neither confirms nor rules out this link, so the path has a gap here (${cited}).`
    return [{ edge, from, to, note: edge.fromGraph ? `${note} Added from the surrounding graph, not the verdict's own chain.` : note }]
  })
}

// ---------- 3D placement ----------

/** World units for the 3D view: columns by depth along x, lanes by row along z. */
export const SPACE = { col: 2.9, lane: 2.2, tileW: 1.7, tileH: 0.26, tileD: 0.95 }

export interface Placed3D {
  x: number
  z: number
}

/** Deterministic tile positions from the 2D layout; the same run always lands in the same place. */
export function place3d(layout: Layout): Map<string, Placed3D> {
  const mid = (layout.layers - 1) / 2
  return new Map([...layout.at].map(([id, p]) => [id, { x: (p.layer - mid) * SPACE.col, z: p.row * SPACE.lane }]))
}

/**
 * A link's curve as four control points: out of the source tile's right
 * edge, into the target's left edge, arched off the ground. Links that
 * skip columns arch higher so they clear the tiles in between.
 */
export function edgeControls(a: Placed3D, b: Placed3D): [number, number, number][] {
  const y = SPACE.tileH / 2
  const sx = a.x + SPACE.tileW / 2
  const ex = b.x - SPACE.tileW / 2
  const span = Math.max(1, Math.round((b.x - a.x) / SPACE.col))
  const lift = 0.28 + 0.3 * (span - 1) + (a.z !== b.z ? 0.12 : 0)
  const reach = Math.max(0.4, (ex - sx) * 0.42)
  return [
    [sx, y, a.z],
    [sx + reach, y + lift, a.z],
    [ex - reach, y + lift, b.z],
    [ex, y, b.z],
  ]
}

/** The last part of a dotted or snake_case name, for labels; the inspector keeps the full ID. */
export function displayName(label: string, max = 22): string {
  if (label.length <= max) return label
  const tail = label.split(/[./:]/).filter(Boolean).pop() ?? label
  return tail.length <= max ? `…${tail}` : `${label.slice(0, max - 1)}…`
}

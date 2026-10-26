import { Component, Suspense, lazy, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import type { Investigation, LinkStatus } from '../../types'
import { ARM_OUTCOME, LINK_STATUS, VERDICT } from '../../lib/labels'
import {
  investigationMap,
  kindCode,
  layoutMap,
  pathOnly,
  resolveSelection,
  selectionFocus,
  walkSteps,
  wrapName,
  type InvestigationMap,
  type Layout,
  type MapEdge,
  type MapNode,
  type MapSelection,
} from '../../lib/graph'
import { useMedia } from '../../hooks/useMedia'
import { plural } from '../../lib/runs'
import { EvidenceLink, Ident, Refs } from '../common'
import { Icon } from '../Icon'
import { armLabel, pathTitle } from './derive'

const rel = (r: string) => r.replace(/_/g, ' ')

const STATUS_HELP: Record<LinkStatus, string> = {
  observed: 'Read directly from a retrieved row.',
  inferred: 'Proposed from the surrounding evidence; not stated in a retrieved row.',
  unresolved: 'Neither confirmed nor ruled out by the evidence.',
}

type Selection = MapSelection
type Scope = 'path' | 'context'

function useWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/** What the map shows depends on whether the verdict names a path. */
function heading(inv: Investigation, map: InvestigationMap) {
  if (map.path.length > 0) {
    return {
      title: pathTitle(inv),
      lede: `The path the verdict names, drawn on the ${plural(map.nodes.length, 'component')} the Zetaris semantic layer connected around the change. Select a component or link to see what supports it.`,
    }
  }
  if (inv.verdict) {
    return {
      title: 'What Domino retrieved around the change',
      lede: `No path is drawn: the verdict is “${VERDICT[inv.verdict.verdict].label}” and names none. These are the ${plural(map.nodes.length, 'component')} and ${plural(map.edges.length, 'link')} retrieved before testing.`,
    }
  }
  return {
    title: 'Dependency context so far',
    lede: 'The saved trace ends before a verdict, so no path is marked. This is what had been retrieved.',
  }
}

interface Geometry {
  width: number
  height: number
  vertical: boolean
  nodeW: number
  nodeH: number
  pos: Map<string, { x: number; y: number }>
  lines: Map<string, string[]>
}

const PAD = 18
const SPLIT = 22
const LINE = 14

/** Pixel positions for the layout at the width available; narrow spaces stack the columns vertically. */
function geometry(map: InvestigationMap, layout: Layout, width: number): Geometry {
  const rows = layout.maxRow - layout.minRow + 1
  const colW = (width - PAD * 2) / layout.layers
  const vertical = colW < 132
  const nodeW = vertical ? Math.min(250, (width - PAD * 2) / rows - 14) : Math.min(190, colW - 30)
  const chars = Math.max(7, Math.floor((nodeW - SPLIT - 12) / 6.6))
  const lines = new Map(map.nodes.map((n) => [n.id, wrapName(n.label, chars)]))
  const nodeH = Math.max(38, 20 + Math.max(...[...lines.values()].map((l) => l.length)) * LINE)
  const pos = new Map<string, { x: number; y: number }>()
  for (const n of map.nodes) {
    const p = layout.at.get(n.id)!
    if (vertical) {
      const laneW = (width - PAD * 2) / rows
      pos.set(n.id, { x: PAD + (p.row - layout.minRow) * laneW + (laneW - nodeW) / 2, y: PAD + p.layer * (nodeH + 52) })
    } else {
      pos.set(n.id, { x: PAD + p.layer * colW + (colW - nodeW) / 2, y: PAD + (p.row - layout.minRow) * (nodeH + 34) })
    }
  }
  const height = vertical ? PAD * 2 + layout.layers * (nodeH + 52) - 52 : PAD * 2 + rows * (nodeH + 34) - 34
  return { width, height, vertical, nodeW, nodeH, pos, lines }
}

/** A gentle S-curve from one tile's outgoing side to the next tile's incoming side. */
function edgeGeometry(e: MapEdge, g: Geometry) {
  const a = g.pos.get(e.from)!
  const b = g.pos.get(e.to)!
  if (g.vertical) {
    const sx = a.x + g.nodeW / 2
    const sy = a.y + g.nodeH
    const ex = b.x + g.nodeW / 2
    const ey = b.y - 3
    const d = Math.max(18, (ey - sy) / 2)
    return { d: `M${sx} ${sy} C${sx} ${sy + d} ${ex} ${ey - d} ${ex} ${ey}`, mx: (sx + ex) / 2, my: (sy + ey) / 2, gap: Infinity, below: 0 }
  }
  const sx = a.x + g.nodeW
  const sy = a.y + g.nodeH / 2
  const ex = b.x - 3
  const ey = b.y + g.nodeH / 2
  const d = Math.max(18, (ex - sx) / 2)
  // A straight run between neighbouring tiles has no room for its label, so it sits under the row.
  const straight = Math.abs(sy - ey) < 1
  return {
    d: `M${sx} ${sy} C${sx + d} ${sy} ${ex - d} ${ey} ${ex} ${ey}`,
    mx: (sx + ex) / 2,
    my: (sy + ey) / 2,
    gap: straight ? ex - sx : Infinity,
    below: a.y + g.nodeH + 13,
  }
}

const activate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}

const Graph3D = lazy(() => import('./Graph3D'))

type View = '3d' | '2d' | 'list'

/** Whether this browser can draw WebGL at all; the probe context is released straight away. */
function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}

/** Catches a 3D view that fails to start, so the map falls back instead of the page breaking. */
class Graph3DBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * The investigation's central visual: the components the change touches,
 * laid out by dependency depth, with the verdict's path through the middle.
 * One selection drives the 3D view, the 2D map, the list and the inspector.
 */
export function DependencyMap({
  inv,
  initialScope = 'context',
  experimentId = null,
  onExperiment,
}: {
  inv: Investigation
  initialScope?: Scope
  /** The recorded experiment chosen in the instrument, shared so both read the same run. */
  experimentId?: string | null
  onExperiment?: (id: string | null) => void
}) {
  const full = useMemo(() => investigationMap(inv), [inv])
  const hasPath = full.path.length > 0
  const canScope = hasPath && full.nodes.length > full.path.length
  const [chosenScope, setScope] = useState<Scope | null>(null)
  const [chosenView, setView] = useState<View | null>(null)
  const [can3d] = useState(webglAvailable)
  const [lost, setLost] = useState(false)
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const frame = useRef<HTMLDivElement>(null)
  const width = useWidth(frame)
  const narrow = width > 0 && width < 640
  // Narrow screens start on the path alone, one readable column; the full context is a tap away.
  const scope: Scope = !hasPath ? 'context' : (chosenScope ?? (narrow ? 'path' : initialScope))
  // 3D is the default where there's room and WebGL works; small screens start on the 2D map.
  const wants3d = chosenView === '3d' || (chosenView == null && can3d && !narrow)
  const view: View = wants3d ? (can3d && !lost ? '3d' : '2d') : (chosenView ?? '2d')
  const map = useMemo(() => (scope === 'path' ? pathOnly(full) : full), [full, scope])
  const layout = useMemo(() => layoutMap(map), [map])

  const [picked, setPicked] = useState<MapSelection | null>(null)
  const [engaged, setEngaged] = useState(false)
  const sel = resolveSelection(map, picked)
  const select = (s: MapSelection) => {
    setPicked(s)
    setEngaged(true)
  }

  // ----- Follow path: a user-paced walk through the verdict's links. -----
  const steps = useMemo(() => walkSteps(full), [full])
  const [walk, setWalk] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const step = walk == null ? null : steps[walk]
  const goTo = (i: number) => {
    setWalk(i)
    select({ type: 'edge', id: steps[i].edge.id })
  }
  useEffect(() => {
    if (!playing || walk == null || reduced) return
    const t = setTimeout(() => {
      if (walk < steps.length - 1) goTo(walk + 1)
      else setPlaying(false)
    }, 3600)
    return () => clearTimeout(t)
    // goTo only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, walk, reduced, steps.length])
  const exitWalk = () => {
    setWalk(null)
    setPlaying(false)
  }

  const { title, lede } = heading(inv, full)
  const counts = (['observed', 'inferred', 'unresolved'] as const).map((s) => [s, map.edges.filter((e) => e.status === s).length] as const)

  if (full.nodes.length === 0) {
    return (
      <section className="map cell" aria-labelledby="map-title">
        <header className="map-head">
          <div>
            <p className="kicker">Dependency map</p>
            <h2 id="map-title" className="cell-title">
              {title}
            </h2>
          </div>
        </header>
        <p className="map-empty">No components were retrieved in this run, so there is nothing to draw.</p>
      </section>
    )
  }

  return (
    <section className="map" aria-labelledby="map-title">
      <header className="map-head">
        <div className="map-titles">
          <p className="kicker">Dependency map</p>
          <h2 id="map-title" className="cell-title">
            {title}
          </h2>
          <p className="cell-lede">{lede}</p>
        </div>
        <div className="map-controls">
          {steps.length > 0 && walk == null && (
            <button type="button" className="button button-quiet walk-start" onClick={() => goTo(0)}>
              <Icon name="arrow-right" size={14} /> Follow path
            </button>
          )}
          {canScope && (
            <div className="seg" role="group" aria-label="What to draw">
              <button type="button" aria-pressed={scope === 'path'} onClick={() => setScope('path')}>
                Path
              </button>
              <button type="button" aria-pressed={scope === 'context'} onClick={() => setScope('context')}>
                Full context
              </button>
            </div>
          )}
          <div className="seg" role="group" aria-label="Show as">
            <button
              type="button"
              aria-pressed={view === '3d'}
              disabled={!can3d}
              title={can3d ? undefined : 'This browser cannot draw WebGL, so the 3D view is unavailable.'}
              onClick={() => {
                setLost(false)
                setView('3d')
              }}
            >
              3D
            </button>
            <button type="button" aria-pressed={view === '2d'} onClick={() => setView('2d')}>
              2D
            </button>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
              List
            </button>
          </div>
        </div>
      </header>

      {step && walk != null && (
        <div className="walk" role="region" aria-label="Path walkthrough" aria-live="polite">
          <div className="walk-text">
            <p className="kicker">
              Follow path · step {walk + 1} of {steps.length} · an illustrative walkthrough of a saved investigation, not captured traffic
            </p>
            <p className="walk-rel">
              <Ident name={step.from.label} />
              <span className={`walk-arrow status-${step.edge.status}`}>
                {rel(step.edge.relation)} → <span className="walk-status">{LINK_STATUS[step.edge.status].label}</span>
              </span>
              <Ident name={step.to.label} />
            </p>
            <p className={`walk-note status-${step.edge.status}`}>{step.note}</p>
            <Refs refs={step.edge.refs} empty={<span className="muted small">No rows cited for this link.</span>} />
          </div>
          <div className="walk-controls" role="group" aria-label="Walkthrough controls">
            <button type="button" className="button" disabled={walk === 0} onClick={() => goTo(walk - 1)}>
              ← Previous
            </button>
            <button type="button" className="button" disabled={walk === steps.length - 1} onClick={() => goTo(walk + 1)}>
              Next →
            </button>
            <button
              type="button"
              className="button"
              aria-pressed={playing}
              disabled={reduced}
              title={reduced ? 'Automatic playback is off because reduced motion is on.' : undefined}
              onClick={() => {
                if (!playing && walk === steps.length - 1) goTo(0)
                setPlaying((p) => !p)
              }}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" className="button button-quiet" onClick={() => goTo(0)}>
              Restart
            </button>
            <button type="button" className="button button-quiet" onClick={exitWalk}>
              Exit
            </button>
          </div>
        </div>
      )}

      <div className="map-body">
        <div className="map-stage" ref={frame}>
          {wants3d && !can3d && (
            <p className="g3d-fallback">
              <Icon name="info" size={14} /> The 3D view needs WebGL, which this browser isn't providing, so the 2D map is shown. It
              holds the same components, links and evidence.
            </p>
          )}
          {wants3d && can3d && lost && (
            <p className="g3d-fallback">
              <Icon name="alert" size={14} /> The 3D view stopped (the graphics context was lost), so the 2D map is shown.{' '}
              <button type="button" className="text-button" onClick={() => setLost(false)}>
                Try 3D again
              </button>
            </p>
          )}
          {view === '3d' ? (
            <Graph3DBoundary onError={() => setLost(true)}>
              <Suspense fallback={<div className="g3d-loading">Loading the 3D view…</div>}>
                <Graph3D
                  map={map}
                  layout={layout}
                  sel={sel}
                  engaged={engaged}
                  onSelect={select}
                  walkEdge={step?.edge.id ?? null}
                  reduced={reduced}
                  onLost={() => setLost(true)}
                />
              </Suspense>
            </Graph3DBoundary>
          ) : view === '2d' ? (
            width > 0 && <MapDrawing map={map} layout={layout} width={width} sel={sel} engaged={engaged} onSelect={select} />
          ) : (
            <MapList map={map} sel={sel} onSelect={select} />
          )}
          <ul className="map-legend" aria-label="How to read the map">
            {counts.map(([s, n]) => (
              <li key={s} className={`status-${s}`}>
                <span className="legend-line" aria-hidden="true" />
                {LINK_STATUS[s].label} <span className="count">{n}</span>
              </li>
            ))}
            <li className="legend-change">
              <span className="legend-tile" aria-hidden="true" />
              Proposed change
            </li>
            {hasPath && (
              <li>
                <span className="legend-path" aria-hidden="true" />
                On the verdict's path
              </li>
            )}
            {view === '3d' && <li className="legend-note">Position and height carry no meaning beyond dependency order</li>}
          </ul>
        </div>
        <div className="map-side">
          <MapInspector map={full} shown={map} sel={sel} onSelect={select} />
          {onExperiment && inv.experiments.length > 0 && <ExperimentPanel inv={inv} id={experimentId} onPick={onExperiment} />}
        </div>
      </div>
    </section>
  )
}

function MapDrawing({
  map,
  layout,
  width,
  sel,
  engaged,
  onSelect,
}: {
  map: InvestigationMap
  layout: Layout
  width: number
  sel: Selection
  engaged: boolean
  onSelect: (s: Selection) => void
}) {
  const uid = useId().replace(/:/g, '')
  const g = geometry(map, layout, width)
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const { edges: hotEdges, nodes: hotNodes } = selectionFocus(map, sel)
  const labelled = (e: MapEdge) => e.onPath || hotEdges.has(e.id) || (map.path.length === 0 && map.edges.length <= 8)
  const state = (hot: boolean, selected: boolean) => `${selected ? ' is-selected' : ''}${hot ? ' is-hot' : ''}${engaged && !hot ? ' is-dim' : ''}`
  const geo = new Map(map.edges.map((e) => [e.id, edgeGeometry(e, g)]))

  return (
    <svg
      className={`map-svg${g.vertical ? ' is-vertical' : ''}`}
      width={g.width}
      height={g.height}
      viewBox={`0 0 ${g.width} ${g.height}`}
      role="group"
      aria-label="Dependency map: components and the links between them"
    >
      <defs>
        {(['observed', 'inferred', 'unresolved'] as const).map((s) => (
          <marker key={s} id={`arrow-${uid}-${s}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L8 4 L0 8 z" className={`arrow status-${s}`} />
          </marker>
        ))}
      </defs>

      <g aria-hidden="true">
        {map.edges.map((e) => (
          <path
            key={e.id}
            d={geo.get(e.id)!.d}
            className={`edge-line status-${e.status}${e.onPath ? ' on-path' : ''}${state(hotEdges.has(e.id), sel.type === 'edge' && sel.id === e.id)}`}
            markerEnd={`url(#arrow-${uid}-${e.status})`}
          />
        ))}
      </g>

      {map.nodes.map((n) => {
        const p = g.pos.get(n.id)!
        const lines = g.lines.get(n.id)!
        const selected = sel.type === 'node' && sel.id === n.id
        const top = g.nodeH / 2 - ((lines.length - 1) * LINE) / 2 + 4
        return (
          <g
            key={n.id}
            className={`tile${n.isChange ? ' is-change' : ''}${n.step != null ? ' on-path' : ''}${state(hotNodes.has(n.id), selected)}`}
            transform={`translate(${p.x} ${p.y})`}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`${n.isChange ? 'Proposed change' : n.kind} ${n.label}${n.step != null && n.step > 0 ? `, path step ${n.step}` : ''}`}
            onClick={() => onSelect({ type: 'node', id: n.id })}
            onKeyDown={activate(() => onSelect({ type: 'node', id: n.id }))}
          >
            <title>{`${n.kind}: ${n.label}`}</title>
            <rect className="tile-frame" width={g.nodeW} height={g.nodeH} />
            <line className="tile-split" x1={SPLIT} x2={SPLIT} y1={5} y2={g.nodeH - 5} />
            <text className="tile-kind" transform={`translate(${SPLIT / 2 + 1} ${g.nodeH / 2}) rotate(-90)`} textAnchor="middle" dominantBaseline="central">
              {kindCode(n.kind)}
            </text>
            <text className="tile-name" y={top}>
              {lines.map((l, i) => (
                <tspan key={i} x={SPLIT + 7} dy={i === 0 ? 0 : LINE}>
                  {l}
                </tspan>
              ))}
            </text>
            {n.step != null && n.step > 0 && (
              <text className="tile-step" x={g.nodeW - 5} y={11} textAnchor="end">
                {String(n.step).padStart(2, '0')}
              </text>
            )}
          </g>
        )
      })}

      {map.edges.map((e) => {
        const { d, mx, my, gap, below } = geo.get(e.id)!
        const text = rel(e.relation)
        const w = text.length * 6.2 + 10
        const under = w > gap - 6
        const ly = under ? below : my
        const selected = sel.type === 'edge' && sel.id === e.id
        return (
          <g
            key={e.id}
            className={`edge status-${e.status}${e.onPath ? ' on-path' : ''}${state(hotEdges.has(e.id), selected)}`}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`${byId.get(e.from)?.label} ${text} ${byId.get(e.to)?.label}, ${LINK_STATUS[e.status].label.toLowerCase()} link`}
            onClick={() => onSelect({ type: 'edge', id: e.id })}
            onKeyDown={activate(() => onSelect({ type: 'edge', id: e.id }))}
          >
            <path className="edge-hit" d={d} />
            {labelled(e) && (
              <g className="edge-label" transform={`translate(${mx} ${ly})`}>
                {under && <line className="edge-leader" x1={0} x2={0} y1={my - ly} y2={-8} />}
                <rect x={-w / 2} y={-8} width={w} height={16} />
                <text textAnchor="middle" dominantBaseline="central">
                  {text}
                </text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** The same map as lists, for screen readers and for reading it line by line. */
function MapList({ map, sel, onSelect }: { map: InvestigationMap; sel: Selection; onSelect: (s: Selection) => void }) {
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const pathEdges = map.path.slice(1).map((id, i) => map.edges.find((e) => e.onPath && e.from === map.path[i] && e.to === id))
  const pick = (s: Selection) => ({ 'aria-pressed': sel.type === s.type && sel.id === s.id, onClick: () => onSelect(s) })
  return (
    <div className="map-list">
      {map.path.length > 0 && (
        <>
          <h3 className="kicker">The path, in order</h3>
          <ol className="map-list-path">
            {map.path.map((id, i) => (
              <li key={id}>
                {i > 0 && pathEdges[i - 1] && (
                  <button type="button" className={`list-link status-${pathEdges[i - 1]!.status}`} {...pick({ type: 'edge', id: pathEdges[i - 1]!.id })}>
                    {rel(pathEdges[i - 1]!.relation)} · {LINK_STATUS[pathEdges[i - 1]!.status].label}
                  </button>
                )}
                <button type="button" className="list-node" {...pick({ type: 'node', id })}>
                  <span className="list-kind">{byId.get(id)?.isChange ? 'change' : byId.get(id)?.kind}</span> {byId.get(id)?.label}
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
      <h3 className="kicker">Every link ({map.edges.length})</h3>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Every link">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">From</th>
              <th scope="col">Relation</th>
              <th scope="col">To</th>
              <th scope="col">How it's known</th>
            </tr>
          </thead>
          <tbody>
            {map.edges.map((e) => (
              <tr key={e.id} className={e.onPath ? 'is-path' : undefined}>
                <td>
                  <button type="button" className="text-button" {...pick({ type: 'node', id: e.from })}>
                    {byId.get(e.from)?.label}
                  </button>
                </td>
                <td>
                  <button type="button" className="text-button" {...pick({ type: 'edge', id: e.id })}>
                    {rel(e.relation)}
                  </button>
                </td>
                <td>
                  <button type="button" className="text-button" {...pick({ type: 'node', id: e.to })}>
                    {byId.get(e.to)?.label}
                  </button>
                </td>
                <td>
                  <span className={`link-status status-${e.status}`}>{LINK_STATUS[e.status].label}</span>
                  {e.onPath && <span className="cell-sub">On the path</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NodeName({ node, onSelect }: { node: MapNode | undefined; onSelect: (s: Selection) => void }) {
  if (!node) return null
  return (
    <button type="button" className="text-button" onClick={() => onSelect({ type: 'node', id: node.id })}>
      <Ident name={node.label} />
    </button>
  )
}

/** What the selected component or link is, where it was found, and what it connects to. */
function MapInspector({
  map,
  shown,
  sel,
  onSelect,
}: {
  map: InvestigationMap
  shown: InvestigationMap
  sel: Selection
  onSelect: (s: Selection) => void
}) {
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const node = sel.type === 'node' ? byId.get(sel.id) : undefined
  const edge = sel.type === 'edge' ? map.edges.find((e) => e.id === sel.id) : undefined
  const steps = map.path.length - 1

  return (
    <aside className="map-inspector" aria-label="Selected component or link" aria-live="polite">
      {node && (
        <>
          <p className="kicker">
            {node.isChange ? 'Proposed change' : node.kind}
            {node.step != null && node.step > 0 && ` · path step ${node.step} of ${steps}`}
            {node.step == null && !node.isChange && ' · retrieved context'}
          </p>
          <h3 className="insp-title">
            <Ident name={node.label} />
          </h3>
          <dl className="insp-facts">
            <div>
              <dt>ID</dt>
              <dd>
                <code className="wrap-id">{node.id}</code>
              </dd>
            </div>
            <div>
              <dt>Found in</dt>
              <dd>
                <Refs refs={node.refs} empty={<span className="muted">No source row cited for this component.</span>} />
              </dd>
            </div>
          </dl>
          <InspectorLinks node={node} map={map} shown={shown} onSelect={onSelect} />
        </>
      )}
      {edge && (
        <>
          <p className={`kicker status-${edge.status}`}>
            {LINK_STATUS[edge.status].label} link · {edge.onPath ? 'on the path' : 'retrieved context'}
            {edge.fromGraph && ' · from the surrounding graph'}
          </p>
          <h3 className="insp-title insp-link">
            <NodeName node={byId.get(edge.from)} onSelect={onSelect} />
            <span className="insp-rel">{rel(edge.relation)}</span>
            <NodeName node={byId.get(edge.to)} onSelect={onSelect} />
          </h3>
          <p className="insp-help">{STATUS_HELP[edge.status]}</p>
          <dl className="insp-facts">
            {edge.detail && (
              <div>
                <dt>Recorded detail</dt>
                <dd>
                  <code className="wrap-id">{edge.detail}</code>
                </dd>
              </div>
            )}
            <div>
              <dt>Supporting rows</dt>
              <dd>
                <Refs refs={edge.refs} empty={<span className="muted">No rows cited for this link.</span>} />
              </dd>
            </div>
          </dl>
        </>
      )}
    </aside>
  )
}

function InspectorLinks({
  node,
  map,
  shown,
  onSelect,
}: {
  node: MapNode
  map: InvestigationMap
  shown: InvestigationMap
  onSelect: (s: Selection) => void
}) {
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const links = map.edges.filter((e) => e.from === node.id || e.to === node.id)
  if (links.length === 0) return <p className="muted small">No links recorded for this component.</p>
  return (
    <div className="insp-links">
      <p className="kicker">Links ({links.length})</p>
      <ul>
        {links.map((e) => {
          const out = e.from === node.id
          const other = byId.get(out ? e.to : e.from)
          const visible = shown.edges.some((s) => s.id === e.id)
          return (
            <li key={e.id}>
              <button type="button" className={`insp-link-row status-${e.status}`} onClick={() => onSelect({ type: 'edge', id: e.id })} disabled={!visible}>
                <span className="dir" aria-hidden="true">
                  {out ? '→' : '←'}
                </span>
                <span>
                  {out ? rel(e.relation) : `${rel(e.relation)} from`} <Ident name={other?.label ?? ''} />
                </span>
                <span className="insp-link-status">{LINK_STATUS[e.status].label}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {links.some((e) => !shown.edges.some((s) => s.id === e.id)) && <p className="muted small">Switch to Full context to inspect links off the path.</p>}
    </div>
  )
}

/**
 * One recorded sandbox run, read beside the map. The saved runs don't tie a
 * check to a particular component, so the run's outcome is shown for the
 * whole investigation and nothing on the map is marked as failing.
 */
function ExperimentPanel({ inv, id, onPick }: { inv: Investigation; id: string | null; onPick: (id: string | null) => void }) {
  const runs = inv.experiments
  const x = runs.find((r) => r.id === id) ?? null
  const missing = (['baseline', 'candidate', 'control'] as const).filter((v) => !runs.some((r) => r.variant === v))
  const o = x ? ARM_OUTCOME[x.outcome] : null
  return (
    <section className="exp-panel" aria-labelledby="exp-title">
      <p className="kicker" id="exp-title">
        Recorded experiment
      </p>
      <div className="exp-pick" role="group" aria-label="Choose a recorded run">
        {runs.map((r) => (
          <button key={r.id} type="button" aria-pressed={r.id === id} className={r.outcome === 'pass' ? '' : 'is-fail'} onClick={() => onPick(r.id === id ? null : r.id)}>
            {armLabel(r, runs)}
          </button>
        ))}
        {missing.map((v) => (
          <button key={v} type="button" disabled>
            {v[0].toUpperCase() + v.slice(1)} · not recorded
          </button>
        ))}
      </div>
      {!x || !o ? (
        <p className="muted small">Choose a run to read its checks and observations beside the map.</p>
      ) : (
        <div className="exp-read">
          <p className={`outcome tone-${o.tone}`}>
            <Icon name={o.icon} size={14} /> {x.completed ? o.label : 'Did not finish'}
            <span className="muted"> · {armLabel(x, runs)}, {x.variant === 'baseline' ? 'without the change' : x.variant === 'candidate' ? 'with the change' : 'change undone'}</span>
          </p>
          {x.completed ? (
            <ul className="exp-checks">
              {x.assertions.map((a) => (
                <li key={a.name} className={a.passed ? 'is-pass' : 'is-fail'}>
                  <Icon name={a.passed ? 'check' : 'x'} size={13} />
                  <Ident name={a.name} />
                  {!a.passed && a.detail && <span className="muted"> {a.detail}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">This run did not finish, so its checks have no result.</p>
          )}
          <dl className="exp-obs">
            {Object.entries(x.observations).map(([k, v]) => (
              <div key={k}>
                <dt>
                  <Ident name={k} />
                </dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
          </dl>
          <p className="readout-sub">
            Shown for the whole investigation: the saved run doesn't tie its checks to a component, so none is marked on the map.{' '}
            <EvidenceLink id={x.id}>Open the run record</EvidenceLink>
          </p>
        </div>
      )}
    </section>
  )
}

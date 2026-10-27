// The dependency map as a canvas: it always fits its frame on load, the
// background pans, cards drag (links stay attached), ⌘/Ctrl + scroll or a
// pinch zooms, and a "Center view" button appears once anything has moved.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { layoutMap, wrapName, type InvestigationMap, type MapSelection } from '../../../lib/graph'
import { LINK_STATUS } from '../../../lib/labels'
import { DIcon } from '../../icons'
import { kindWord, relationWords } from '../../words'

// Top to bottom: dependency depth runs down the page, parallel branches sit side by side.
const NODE_W = 200
const NODE_H = 50
const COL = 232
const ROW = 86
const MARGIN = 28
const MIN_K = 0.3
const MAX_K = 2

type Pt = { x: number; y: number }
type View = { x: number; y: number; k: number }

/** The transform that fits every card in the frame, centred, never larger than 1:1. */
function fitView(pos: Map<string, Pt>, w: number, h: number): View {
  if (pos.size === 0 || w === 0 || h === 0) return { x: 0, y: 0, k: 1 }
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of pos.values()) {
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x + NODE_W)
    y1 = Math.max(y1, p.y + NODE_H)
  }
  const bw = x1 - x0
  const bh = y1 - y0
  const k = Math.max(MIN_K, Math.min(1, (w - MARGIN * 2) / bw, (h - MARGIN * 2) / bh))
  return { k, x: (w - bw * k) / 2 - x0 * k, y: (h - bh * k) / 2 - y0 * k }
}

/** A link from the bottom of one card to the top of the next, or side to side when they're level. */
function linkPath(a: Pt, b: Pt) {
  const dy = b.y - a.y
  if (Math.abs(dy) >= NODE_H) {
    const down = dy > 0
    const x1 = a.x + NODE_W / 2
    const y1 = down ? a.y + NODE_H : a.y
    const x2 = b.x + NODE_W / 2
    const y2 = down ? b.y - 2 : b.y + NODE_H + 2
    const c = Math.max(24, Math.abs(y2 - y1) / 2.5) * (down ? 1 : -1)
    return `M${x1},${y1} C${x1},${y1 + c} ${x2},${y2 - c} ${x2},${y2}`
  }
  const right = b.x > a.x
  const x1 = right ? a.x + NODE_W : a.x
  const x2 = right ? b.x - 2 : b.x + NODE_W + 2
  const y1 = a.y + NODE_H / 2
  const y2 = b.y + NODE_H / 2
  const c = Math.max(30, Math.abs(x2 - x1) / 2.5) * (right ? 1 : -1)
  return `M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}`
}

type Drag =
  | { kind: 'node'; id: string; px: number; py: number; nx: number; ny: number; moved: boolean }
  | { kind: 'pan'; px: number; py: number; vx: number; vy: number; moved: boolean }

/** The semantic-layer graph on a movable canvas, with selection and dimming. */
export function Graph({ map, sel, onSelect }: { map: InvestigationMap; sel: MapSelection | null; onSelect: (s: MapSelection | null) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag | null>(null)

  const layout = useMemo(() => layoutMap(map), [map])
  const initial = useMemo(() => {
    const m = new Map<string, Pt>()
    for (const [id, p] of layout.at) m.set(id, { x: (p.row - layout.minRow) * COL, y: p.layer * ROW })
    return m
  }, [layout])

  const [pos, setPos] = useState(initial)
  const [view, setView] = useState<View | null>(null) // null = fitted to the frame
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [grabbing, setGrabbing] = useState(false)

  // A new map (other run, other scope) starts laid out and fitted.
  useEffect(() => {
    setPos(initial)
    setView(null)
  }, [initial])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitted = useMemo(() => fitView(pos, size.w, size.h), [pos, size])
  const v = view ?? fitted
  const vRef = useRef(v)
  vRef.current = v

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    const cur = vRef.current
    const k = Math.max(MIN_K, Math.min(MAX_K, cur.k * factor))
    const f = k / cur.k
    setView({ k, x: cx - (cx - cur.x) * f, y: cy - (cy - cur.y) * f })
  }, [])

  // ⌘/Ctrl + wheel (and trackpad pinch, which arrives as ctrl + wheel) zooms; plain wheel scrolls the page.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const onPointerDown = (e: React.PointerEvent, nodeId?: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    if (!view) setView(v) // freeze the fit so moving a card doesn't re-zoom the canvas
    if (nodeId) {
      const p = pos.get(nodeId)!
      drag.current = { kind: 'node', id: nodeId, px: e.clientX, py: e.clientY, nx: p.x, ny: p.y, moved: false }
    } else {
      drag.current = { kind: 'pan', px: e.clientX, py: e.clientY, vx: v.x, vy: v.y, moved: false }
      setGrabbing(true)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.px
    const dy = e.clientY - d.py
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    d.moved = true
    if (d.kind === 'node') {
      const k = vRef.current.k
      setPos((prev) => new Map(prev).set(d.id, { x: d.nx + dx / k, y: d.ny + dy / k }))
    } else {
      setView({ k: vRef.current.k, x: d.vx + dx, y: d.vy + dy })
    }
  }

  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    setGrabbing(false)
    if (!d || d.moved) return
    if (d.kind === 'node') onSelect({ type: 'node', id: d.id })
    else onSelect(null)
  }

  const layoutChanged = pos !== initial
  const viewChanged = view !== null && (Math.abs(view.k - fitted.k) > 0.01 || Math.abs(view.x - fitted.x) > 1 || Math.abs(view.y - fitted.y) > 1)

  // What the selection touches, so everything else can fade.
  const focus = useMemo(() => {
    if (!sel) return null
    const nodes = new Set<string>()
    const edges = new Set<string>()
    if (sel.type === 'node') {
      nodes.add(sel.id)
      for (const e of map.edges) if (e.from === sel.id || e.to === sel.id) [edges.add(e.id), nodes.add(e.from), nodes.add(e.to)]
    } else {
      const e = map.edges.find((x) => x.id === sel.id)
      if (e) [edges.add(e.id), nodes.add(e.from), nodes.add(e.to)]
    }
    return { nodes, edges }
  }, [sel, map])

  const centre = () => setView(null)

  return (
    <div className={`dx-graph dx-canvas${grabbing ? ' is-grabbing' : ''}`} ref={wrapRef}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        role="img"
        aria-label="Dependency map. Drag the background to pan, drag a card to move it, Ctrl or Command and scroll to zoom."
        onPointerDown={(e) => onPointerDown(e)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <pattern id="dx-dots" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform={`translate(${v.x} ${v.y}) scale(${v.k})`}>
            <circle cx="1" cy="1" r="1" fill="rgb(31 29 27 / 0.12)" />
          </pattern>
          <marker id="dx-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L8 4L0 8z" fill="#8a847c" />
          </marker>
          <marker id="dx-arrow-path" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L8 4L0 8z" fill="#1f1d1b" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#dx-dots)" />
        <g transform={`translate(${v.x} ${v.y}) scale(${v.k})`}>
          {map.edges.map((e) => {
            const a = pos.get(e.from)
            const b = pos.get(e.to)
            if (!a || !b) return null
            const d = linkPath(a, b)
            const cls = [
              'gx-edge',
              `st-${e.status}`,
              e.onPath && 'is-path',
              sel?.type === 'edge' && sel.id === e.id && 'is-selected',
              focus && !focus.edges.has(e.id) && 'is-dim',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <g
                key={e.id}
                className={cls}
                onPointerDown={(ev) => ev.stopPropagation()}
                onClick={() => onSelect({ type: 'edge', id: e.id })}
              >
                <title>{`${relationWords(e.relation)} · ${LINK_STATUS[e.status].label}`}</title>
                <path d={d} markerEnd={`url(#${e.onPath ? 'dx-arrow-path' : 'dx-arrow'})`} />
                <path className="gx-hit" d={d} />
              </g>
            )
          })}
          {map.nodes.map((n) => {
            const p = pos.get(n.id)
            if (!p) return null
            const lines = wrapName(n.label, 27, 2)
            const cls = [
              'gx-node',
              n.step != null && 'is-path',
              n.isChange && 'is-change',
              sel?.type === 'node' && sel.id === n.id && 'is-selected',
              focus && !focus.nodes.has(n.id) && 'is-dim',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <g
                key={n.id}
                className={cls}
                transform={`translate(${p.x},${p.y})`}
                onPointerDown={(e) => onPointerDown(e, n.id)}
                tabIndex={0}
                role="button"
                aria-label={`${n.label} (${kindWord(n.kind)})`}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect({ type: 'node', id: n.id })}
              >
                <title>{n.label}</title>
                <rect width={NODE_W} height={NODE_H} rx={6} />
                <text className="gx-kind" x={10} y={16}>
                  {n.isChange ? 'CHANGE' : kindWord(n.kind).toUpperCase()}
                </text>
                {lines.map((l, i) => (
                  <text key={i} className="gx-label" x={10} y={lines.length === 1 ? 36 : 31 + i * 13}>
                    {l}
                  </text>
                ))}
              </g>
            )
          })}
        </g>
      </svg>

      {(viewChanged || layoutChanged) && (
        <div className="dx-canvas-top">
          {viewChanged && (
            <button type="button" className="dx-canvas-pill" onClick={centre}>
              <DIcon name="overview" size={13} /> Center view
            </button>
          )}
          {layoutChanged && (
            <button
              type="button"
              className="dx-canvas-pill is-quiet"
              onClick={() => {
                setPos(initial)
                setView(null)
              }}
            >
              Reset layout
            </button>
          )}
        </div>
      )}

      <div className="dx-canvas-tools" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(0.8, size.w / 2, size.h / 2)}>
          −
        </button>
        <button type="button" aria-label="Fit to screen" title="Fit to screen" onClick={centre}>
          <DIcon name="overview" size={13} />
        </button>
      </div>
    </div>
  )
}

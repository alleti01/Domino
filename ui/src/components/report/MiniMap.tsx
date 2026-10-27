import { useMemo } from 'react'
import type { Investigation } from '../../types'
import { investigationMap, layoutMap } from '../../lib/graph'
import { plural } from '../../lib/runs'

const COL = 48
const ROW = 18
const W = 24
const H = 10
const PAD = 6

/**
 * A thumbnail of one investigation's real dependency graph: the same layout
 * as the report's map, with the verdict's path (if any) in full strength and
 * the surrounding context faint. Only the path's two ends are captioned.
 */
export function MiniMap({ inv }: { inv: Investigation }) {
  const map = useMemo(() => investigationMap(inv), [inv])
  const layout = useMemo(() => layoutMap(map), [map])
  if (map.nodes.length === 0) return <div className="minimap is-empty">No components retrieved</div>

  const rows = layout.maxRow - layout.minRow + 1
  const width = PAD * 2 + (layout.layers - 1) * COL + W
  const height = PAD * 2 + (rows - 1) * ROW + H
  const at = (id: string) => {
    const p = layout.at.get(id)!
    return { x: PAD + p.layer * COL, y: PAD + (p.row - layout.minRow) * ROW }
  }
  const noPath = !inv.verdict ? 'no verdict yet' : inv.verdict.verdict === 'no_failure_observed' ? 'no failure path' : 'no path named'
  const label = `Dependency map: ${plural(map.nodes.length, 'component')}, ${plural(map.edges.length, 'link')}${
    map.path.length > 0 ? `; the verdict's path crosses ${plural(map.path.length - 1, 'link')}` : `; ${noPath}`
  }`

  const first = map.nodes.find((n) => n.id === map.path[0])
  const last = map.nodes.find((n) => n.id === map.path[map.path.length - 1])
  return (
    <figure className="minimap-figure">
      <svg className="minimap" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
        {map.edges.map((e) => {
          const a = at(e.from)
          const b = at(e.to)
          const sx = a.x + W
          const sy = a.y + H / 2
          const ex = b.x
          const ey = b.y + H / 2
          const d = (ex - sx) / 2
          return (
            <path
              key={e.id}
              d={`M${sx} ${sy} C${sx + d} ${sy} ${ex - d} ${ey} ${ex} ${ey}`}
              className={`mini-edge status-${e.status}${e.onPath ? ' on-path' : ''}`}
            />
          )
        })}
        {map.nodes.map((n) => {
          const p = at(n.id)
          return (
            <g key={n.id} transform={`translate(${p.x} ${p.y})`} className={`mini-tile${n.isChange ? ' is-change' : ''}${n.step != null ? ' on-path' : ''}`}>
              <rect width={W} height={H} />
              <line x1={7} x2={7} y1={2} y2={H - 2} />
            </g>
          )
        })}
      </svg>
      <figcaption className="minimap-caption" aria-hidden="true">
        {first && last ? (
          <>
            <span className="cap-change">{first.label}</span>
            <span className="cap-arrow">→ {plural(map.path.length - 1, 'link')} →</span>
            <span>{last.label}</span>
          </>
        ) : (
          <span>
            {plural(map.nodes.length, 'component')} · {plural(map.edges.length, 'link')} retrieved · {noPath}
          </span>
        )}
      </figcaption>
    </figure>
  )
}

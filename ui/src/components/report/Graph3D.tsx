import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import type { LinkStatus } from '../../types'
import { LINK_STATUS } from '../../lib/labels'
import {
  SPACE,
  displayName,
  edgeControls,
  kindCode,
  place3d,
  selectionFocus,
  type InvestigationMap,
  type Layout,
  type MapEdge,
  type MapSelection,
} from '../../lib/graph'

// The dashboard's palette, as the 3D view uses it.
const STATUS_COLOR: Record<LinkStatus, string> = { observed: '#a9d3ef', inferred: '#ffbf6a', unresolved: '#ff7a5e' }
const IVORY = '#ece5d6'
const ACCENT = '#a9d3ef'
const GRID = '#1f2a36'

// A shallow, near-isometric start: looking down at about 56° from just left of front, so the path reads left to right.
const BASE_AZIMUTH = -0.2
const BASE_POLAR = 0.98
// Narrow canvases turn the path onto a diagonal so it uses the height, and look down a little more.
const COMPACT_AZIMUTH = -0.85
const COMPACT_POLAR = 0.78
const COMPACT_WIDTH = 560
const AZIMUTH_RANGE = 0.8
const POLAR_RANGE: [number, number] = [0.42, 1.18]
const DRAG_TOLERANCE = 5

export interface Graph3DProps {
  map: InvestigationMap
  layout: Layout
  sel: MapSelection
  /** Whether the user has picked something; only then does unrelated context step back. */
  engaged: boolean
  onSelect: (s: MapSelection) => void
  /** The link the walkthrough is on, if one is running. */
  walkEdge: string | null
  reduced: boolean
  /** The graphics context went away; the caller falls back to 2D. */
  onLost: () => void
}

interface CameraApi {
  fit: () => void
  reset: () => void
  focus: () => void
  zoom: (factor: number) => void
  rotate: (delta: number) => void
}

/**
 * The investigation's dependency map as a spatial diagram: flat domino tiles
 * on a reference grid, columns by dependency depth, the verdict's path on
 * the front lane, context in shallow lanes behind and in front. Labels are
 * HTML, so they stay readable and focusable as the camera moves.
 */
export default function Graph3D(props: Graph3DProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const api = useRef<CameraApi | null>(null)
  const labels = useRef(new Map<string, HTMLElement>())
  const onScreen = useOnScreen(wrap)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < COMPACT_WIDTH))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { map, sel, engaged, onSelect } = props
  const focus = selectionFocus(map, sel)
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const labelled = (e: MapEdge) => e.onPath || focus.edges.has(e.id) || e.id === props.walkEdge
  const strong = (id: string) => byId.get(id)?.isChange || byId.get(id)?.step != null || focus.nodes.has(id)

  return (
    <div className={`g3d${compact ? ' is-compact' : ''}`} ref={wrap}>
      <div className="g3d-bar">
        <div className="g3d-tools" role="toolbar" aria-label="3D view">
          <button type="button" onClick={() => api.current?.fit()}>
            Fit graph
          </button>
          <button type="button" onClick={() => api.current?.focus()}>
            Focus selection
          </button>
          <button type="button" onClick={() => api.current?.reset()}>
            Reset view
          </button>
          <span className="g3d-sep" aria-hidden="true" />
          <button type="button" onClick={() => api.current?.rotate(-0.3)} aria-label="Rotate left">
            ⟲
          </button>
          <button type="button" onClick={() => api.current?.rotate(0.3)} aria-label="Rotate right">
            ⟳
          </button>
          <button type="button" onClick={() => api.current?.zoom(1 / 1.25)} aria-label="Zoom out">
            −
          </button>
          <button type="button" onClick={() => api.current?.zoom(1.25)} aria-label="Zoom in">
            +
          </button>
        </div>
        <p className="g3d-hint">
          <span className="hint-fine">Drag to rotate · Shift-drag to pan · Scroll moves the page</span>
          <span className="hint-touch">Drag sideways to rotate · Two fingers to pan · Swipe up or down to scroll</span>
        </p>
      </div>

      <div className="g3d-stage">
        <Canvas
          orthographic
          frameloop={onScreen ? 'demand' : 'never'}
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
          camera={{ position: [0, 20, 30], near: 0.1, far: 400, zoom: 40 }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault()
              props.onLost()
            })
          }}
        >
          <Lighting />
          <Scene {...props} api={api} labels={labels} />
        </Canvas>

        {/* Labels: buttons projected onto the scene each frame. They select exactly like the tiles. */}
        <div className="g3d-labels">
          {map.nodes.map((n) => {
            const selected = sel.type === 'node' && sel.id === n.id
            return (
              <button
                key={n.id}
                type="button"
                ref={(el) => {
                  if (el) labels.current.set(`n:${n.id}`, el)
                  else labels.current.delete(`n:${n.id}`)
                }}
                className={`g3d-label${n.isChange ? ' is-change' : ''}${strong(n.id) ? ' is-strong' : ''}${selected ? ' is-selected' : ''}${
                  engaged && !focus.nodes.has(n.id) ? ' is-dim' : ''
                }`}
                aria-pressed={selected}
                aria-label={`${n.isChange ? 'Proposed change' : n.kind} ${n.label}`}
                title={n.label}
                onClick={() => onSelect({ type: 'node', id: n.id })}
              >
                <span className="g3d-kind">{n.isChange ? 'change' : kindCode(n.kind)}</span>
                {displayName(n.label, strong(n.id) ? 26 : 16)}
              </button>
            )
          })}
          {map.edges.filter(labelled).map((e) => {
            const selected = sel.type === 'edge' && sel.id === e.id
            return (
              <button
                key={e.id}
                type="button"
                ref={(el) => {
                  if (el) labels.current.set(`e:${e.id}`, el)
                  else labels.current.delete(`e:${e.id}`)
                }}
                className={`g3d-rel status-${e.status}${selected ? ' is-selected' : ''}${engaged && !focus.edges.has(e.id) ? ' is-dim' : ''}`}
                aria-pressed={selected}
                aria-label={`${byId.get(e.from)?.label} ${e.relation.replace(/_/g, ' ')} ${byId.get(e.to)?.label}, ${LINK_STATUS[e.status].label.toLowerCase()} link`}
                onClick={() => onSelect({ type: 'edge', id: e.id })}
              >
                {e.relation.replace(/_/g, ' ')}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Width shows path membership and selection; dashes (set at creation) show provenance. */
function styleLines(lines: Map<string, Line2>, edges: MapEdge[], hot: (e: MapEdge) => boolean, engaged: boolean) {
  for (const e of edges) {
    const m = lines.get(e.id)?.material
    if (!m) continue
    const h = hot(e)
    m.linewidth = h ? 3 : e.onPath ? 2.4 : 1.3
    m.opacity = engaged && !h ? 0.16 : e.onPath || h ? 1 : 0.55
  }
}

function useOnScreen(ref: RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setOn(entry.isIntersecting), { rootMargin: '120px' })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return on
}

function setEnvironment(scene: THREE.Scene, env: THREE.Texture | null, intensity: number) {
  scene.environment = env
  scene.environmentIntensity = intensity
}

/** A restrained studio: soft environment for the tiles' sheen, a cool key and a warm rim. */
function Lighting() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const env = pmrem.fromScene(room, 0.04).texture
    setEnvironment(scene, env, 0.7)
    return () => {
      setEnvironment(scene, null, 0.45)
      env.dispose()
      room.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[-6, 12, 8]} intensity={1.6} color="#e2ecff" />
      <directionalLight position={[8, 5, -9]} intensity={1.1} color="#ffcfa8" />
    </>
  )
}

/** Shared geometry, disposed with the view. */
function useGeometry() {
  const g = useMemo(
    () => ({
      body: new RoundedBoxGeometry(SPACE.tileW, SPACE.tileH, SPACE.tileD, 3, 0.06),
      split: new THREE.BoxGeometry(0.022, 0.01, SPACE.tileD * 0.74),
      outline: new THREE.EdgesGeometry(new THREE.PlaneGeometry(SPACE.tileW + 0.24, SPACE.tileD + 0.24).rotateX(-Math.PI / 2)),
      cone: new THREE.ConeGeometry(0.075, 0.22, 14).rotateX(Math.PI / 2),
      pulse: new THREE.SphereGeometry(0.085, 16, 12),
      gap: new THREE.TorusGeometry(0.16, 0.018, 8, 32),
    }),
    [],
  )
  useEffect(() => () => Object.values(g).forEach((x) => x.dispose()), [g])
  return g
}

function Scene({
  map,
  layout,
  sel,
  engaged,
  onSelect,
  walkEdge,
  reduced,
  api,
  labels,
}: Graph3DProps & { api: RefObject<CameraApi | null>; labels: RefObject<Map<string, HTMLElement>> }) {
  const { camera, gl, size, invalidate } = useThree()
  const geo = useGeometry()
  const pos = useMemo(() => place3d(layout), [layout])
  const curves = useMemo(
    () =>
      new Map(
        map.edges.map((e) => {
          const [a, b, c, d] = edgeControls(pos.get(e.from)!, pos.get(e.to)!).map((p) => new THREE.Vector3(...p))
          return [e.id, new THREE.CubicBezierCurve3(a, b, c, d)]
        }),
      ),
    [map, pos],
  )
  const focus = selectionFocus(map, sel)

  // ----- Fat lines for links: dashes show provenance, width shows path membership and selection. -----
  const lines = useMemo(() => {
    const out = new Map<string, Line2>()
    for (const e of map.edges) {
      const g = new LineGeometry()
      g.setPositions(curves.get(e.id)!.getPoints(48).flatMap((p) => [p.x, p.y, p.z]))
      const m = new LineMaterial({
        color: STATUS_COLOR[e.status],
        linewidth: 1.5,
        transparent: true,
        dashed: e.status !== 'observed',
        dashSize: e.status === 'inferred' ? 0.16 : 0.035,
        gapSize: e.status === 'inferred' ? 0.11 : 0.1,
      })
      const line = new Line2(g, m)
      line.computeLineDistances()
      out.set(e.id, line)
    }
    return out
  }, [map, curves])
  useEffect(
    () => () =>
      lines.forEach((l) => {
        l.geometry.dispose()
        l.material.dispose()
      }),
    [lines],
  )
  useEffect(() => {
    styleLines(lines, map.edges, (e) => focus.edges.has(e.id) || e.id === walkEdge, engaged)
    invalidate()
  })

  const hitTubes = useMemo(() => new Map([...curves].map(([id, c]) => [id, new THREE.TubeGeometry(c, 28, 0.15, 6, false)])), [curves])
  useEffect(() => () => hitTubes.forEach((t) => t.dispose()), [hitTubes])

  // ----- Camera: bounded orbit, no wheel zoom, framing computed from the tiles. -----
  const box = useMemo(() => {
    const b = new THREE.Box3()
    for (const p of pos.values()) {
      b.expandByPoint(new THREE.Vector3(p.x - SPACE.tileW / 2, 0, p.z - SPACE.tileD / 2))
      b.expandByPoint(new THREE.Vector3(p.x + SPACE.tileW / 2, 0.7, p.z + SPACE.tileD / 2))
    }
    return b
  }, [pos])
  const controls = useRef<OrbitControls | null>(null)
  const fitZoom = useRef(40)
  const goal = useRef<{ target: THREE.Vector3; zoom: number } | null>(null)

  const zoomToFit = (b: THREE.Box3, margin: number) => {
    camera.updateMatrixWorld()
    const inv = camera.matrixWorldInverse
    const pts = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
      new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(inv),
    )
    const w = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x))
    const h = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y))
    return Math.min(size.width / (w * margin), size.height / (h * margin))
  }

  const placeCamera = (target: THREE.Vector3, azimuth: number, polar: number) => {
    const off = new THREE.Vector3().setFromSpherical(new THREE.Spherical(60, polar, azimuth))
    camera.position.copy(target).add(off)
    camera.lookAt(target)
    controls.current?.target.copy(target)
  }

  const moveTo = (target: THREE.Vector3, zoom: number) => {
    const z = THREE.MathUtils.clamp(zoom, fitZoom.current * 0.6, fitZoom.current * 3.2)
    if (reduced) {
      shiftTarget(target)
      ;(camera as THREE.OrthographicCamera).zoom = z
      camera.updateProjectionMatrix()
      controls.current?.update()
      invalidate()
    } else {
      goal.current = { target: target.clone(), zoom: z }
      invalidate()
    }
  }

  const shiftTarget = (t: THREE.Vector3) => {
    const c = controls.current
    if (!c) return
    const d = t.clone().sub(c.target)
    c.target.add(d)
    camera.position.add(d)
  }

  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement)
    c.enableZoom = false
    c.enableDamping = false
    c.screenSpacePanning = true
    c.minPolarAngle = POLAR_RANGE[0]
    c.maxPolarAngle = POLAR_RANGE[1]
    c.minAzimuthAngle = COMPACT_AZIMUTH - 0.4
    c.maxAzimuthAngle = BASE_AZIMUTH + AZIMUTH_RANGE
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.PAN }
    // Vertical swipes keep scrolling the page; sideways drags rotate.
    gl.domElement.style.touchAction = 'pan-y'
    controls.current = c
    const bound = box.clone().expandByScalar(1.5)
    const onChange = () => {
      // Keep the pivot over the graph so a pan can't lose it.
      const clamped = c.target.clone().clamp(bound.min, bound.max)
      if (!clamped.equals(c.target)) shiftTarget(clamped)
      invalidate()
    }
    const onStart = () => {
      goal.current = null
    }
    c.addEventListener('change', onChange)
    c.addEventListener('start', onStart)
    return () => {
      c.removeEventListener('change', onChange)
      c.removeEventListener('start', onStart)
      c.dispose()
      controls.current = null
    }
    // shiftTarget only touches refs and the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl, box, invalidate])

  const center = useMemo(() => box.getCenter(new THREE.Vector3()).setY(0), [box])
  const compact = size.width < COMPACT_WIDTH
  const reset = () => {
    goal.current = null
    placeCamera(center, compact ? COMPACT_AZIMUTH : BASE_AZIMUTH, compact ? COMPACT_POLAR : BASE_POLAR)
    fitZoom.current = zoomToFit(box, compact ? 1.45 : 1.06)
    ;(camera as THREE.OrthographicCamera).zoom = fitZoom.current
    camera.updateProjectionMatrix()
    controls.current?.update()
    invalidate()
  }

  // Frame the graph on first show and when the drawn graph or the canvas size changes.
  useEffect(() => {
    if (size.width > 0) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, size.width, size.height])

  const selectionBox = () => {
    const b = new THREE.Box3()
    for (const id of focus.nodes) {
      const p = pos.get(id)
      if (p) b.expandByPoint(new THREE.Vector3(p.x - 1, 0, p.z - 0.6)).expandByPoint(new THREE.Vector3(p.x + 1, 0.6, p.z + 0.6))
    }
    return b
  }

  api.current = {
    fit: () => moveTo(center, zoomToFit(box, compact ? 1.45 : 1.06)),
    reset,
    focus: () => {
      const b = selectionBox()
      if (!b.isEmpty()) moveTo(b.getCenter(new THREE.Vector3()).setY(0), zoomToFit(b, 1.6))
    },
    zoom: (f) => moveTo(controls.current?.target ?? center, (camera as THREE.OrthographicCamera).zoom * f),
    rotate: (delta) => {
      const c = controls.current
      if (!c) return
      const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(c.target))
      s.theta = THREE.MathUtils.clamp(s.theta + delta, c.minAzimuthAngle, c.maxAzimuthAngle)
      camera.position.copy(c.target).add(new THREE.Vector3().setFromSpherical(s))
      camera.lookAt(c.target)
      c.update()
      invalidate()
    },
  }

  // The walkthrough is the one time the camera follows along, and only when motion is welcome.
  useEffect(() => {
    if (!walkEdge || reduced) return
    const c = curves.get(walkEdge)
    if (c) moveTo(c.getPoint(0.5).setY(0), fitZoom.current * 1.35)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkEdge])

  useEffect(() => {
    invalidate()
  })

  // ----- Per frame: ease toward a requested view, place labels, move the walkthrough pulse. -----
  const pulse = useRef<THREE.Mesh>(null)
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame((state, delta) => {
    const g = goal.current
    const ortho = camera as THREE.OrthographicCamera
    if (g && controls.current) {
      const k = 1 - Math.exp(-delta * 7)
      shiftTarget(controls.current.target.clone().lerp(g.target, k))
      ortho.zoom += (g.zoom - ortho.zoom) * k
      ortho.updateProjectionMatrix()
      if (controls.current.target.distanceTo(g.target) < 0.01 && Math.abs(ortho.zoom - g.zoom) < 0.05) goal.current = null
      state.invalidate()
    }
    camera.updateMatrixWorld()

    const place = (key: string, p: THREE.Vector3) => {
      const el = labels.current?.get(key)
      if (!el) return
      v.copy(p).project(camera)
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      const inside = x > -40 && x < size.width + 40 && y > -20 && y < size.height + 20
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`
      el.style.visibility = inside ? 'visible' : 'hidden'
    }
    // Names float just above their tile; a straight link's relation sits on the ground in front of its gap.
    for (const n of map.nodes) {
      const p = pos.get(n.id)!
      place(`n:${n.id}`, new THREE.Vector3(p.x, SPACE.tileH + 0.42, p.z - SPACE.tileD * 0.2))
    }
    for (const e of map.edges) {
      const a = pos.get(e.from)!
      const b = pos.get(e.to)!
      const mid = curves.get(e.id)!.getPoint(0.5)
      place(`e:${e.id}`, a.z === b.z ? new THREE.Vector3(mid.x, 0, a.z + SPACE.tileD / 2 + 0.45) : mid)
    }

    // A pulse travels the link being examined. An unresolved link stops halfway, at the gap.
    const m = pulse.current
    const c = walkEdge ? curves.get(walkEdge) : null
    if (m && c) {
      const edge = map.edges.find((e) => e.id === walkEdge)!
      const cycle = reduced ? 0.5 : (state.clock.elapsedTime % 1.9) / 1.9
      const t = edge.status === 'unresolved' ? Math.min(cycle, 0.5) : cycle
      m.position.copy(c.getPoint(t))
      m.visible = true
      if (!reduced) state.invalidate()
    } else if (m) m.visible = false
  })

  const pick = (s: MapSelection) => (e: ThreeEvent<MouseEvent>) => {
    // A drag that ends over something is a camera move, not a selection.
    if (e.delta > DRAG_TOLERANCE) return
    e.stopPropagation()
    onSelect(s)
  }
  const pointer = (on: boolean) => () => {
    gl.domElement.style.cursor = on ? 'pointer' : ''
  }

  const walk = walkEdge ? map.edges.find((e) => e.id === walkEdge) : null
  const gridSize = Math.ceil(Math.max(box.max.x - box.min.x, box.max.z - box.min.z) + 6)

  return (
    <>
      <gridHelper args={[gridSize, Math.round(gridSize / (SPACE.lane / 2)), GRID, GRID]} position={[center.x, -0.001, center.z]} />

      {map.edges.map((e) => {
        const line = lines.get(e.id)!
        const c = curves.get(e.id)!
        const end = c.getPoint(1)
        const dir = c.getTangent(0.98)
        const hot = focus.edges.has(e.id) || e.id === walkEdge
        return (
          <group key={e.id}>
            <primitive object={line} />
            <mesh
              geometry={geo.cone}
              position={end.clone().addScaledVector(dir, -0.11)}
              quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)}
            >
              <meshBasicMaterial color={STATUS_COLOR[e.status]} transparent opacity={engaged && !hot ? 0.16 : e.onPath || hot ? 1 : 0.6} />
            </mesh>
            <mesh
              geometry={hitTubes.get(e.id)!}
              onClick={pick({ type: 'edge', id: e.id })}
              onPointerOver={pointer(true)}
              onPointerOut={pointer(false)}
            >
              <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
            </mesh>
          </group>
        )
      })}

      {map.nodes.map((n) => {
        const p = pos.get(n.id)!
        const selected = sel.type === 'node' && sel.id === n.id
        const dim = engaged && !focus.nodes.has(n.id)
        return (
          <group key={n.id} position={[p.x, SPACE.tileH / 2, p.z]}>
            <mesh geometry={geo.body} onClick={pick({ type: 'node', id: n.id })} onPointerOver={pointer(true)} onPointerOut={pointer(false)}>
              <meshPhysicalMaterial
                color={n.isChange ? IVORY : n.step != null ? '#2b3746' : '#1c2530'}
                metalness={n.isChange ? 0 : 0.35}
                roughness={n.isChange ? 0.32 : 0.45}
                clearcoat={0.8}
                clearcoatRoughness={0.2}
                transparent
                // The change stays recognisable even when it steps back.
                opacity={dim ? (n.isChange ? 0.75 : 0.3) : 1}
              />
            </mesh>
            {/* The domino's split: a narrow half for the kind, a wide half for the name. */}
            <mesh geometry={geo.split} position={[-SPACE.tileW / 2 + 0.42, SPACE.tileH / 2 + 0.003, 0]}>
              <meshBasicMaterial color={n.isChange ? '#8c8579' : '#3a4756'} transparent opacity={dim ? 0.3 : 1} />
            </mesh>
            {(selected || n.step != null) && (
              <lineSegments geometry={geo.outline} position={[0, -SPACE.tileH / 2 + 0.004, 0]}>
                <lineBasicMaterial color={selected ? ACCENT : IVORY} transparent opacity={selected ? 1 : dim ? 0.12 : 0.4} />
              </lineSegments>
            )}
          </group>
        )
      })}

      <mesh ref={pulse} geometry={geo.pulse} visible={false}>
        <meshBasicMaterial color={walk ? STATUS_COLOR[walk.status] : ACCENT} wireframe={walk?.status !== 'observed'} />
      </mesh>
      {walk?.status === 'unresolved' && (
        <mesh geometry={geo.gap} position={curves.get(walk.id)!.getPoint(0.5)} rotation={[Math.PI / 2, 0, 0]}>
          <meshBasicMaterial color={STATUS_COLOR.unresolved} />
        </mesh>
      )}
    </>
  )
}

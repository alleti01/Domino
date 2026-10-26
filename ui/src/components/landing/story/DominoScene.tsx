// The landing page's 3D scene. One saved run's dependency path is built as a
// single object: domino-shaped components standing face to face on a plinth,
// the proposed change (ivory) at the front. Scrolling unfolds it into the
// connected path, closes in on the one inferred link, encloses that part in a
// sandbox to run baseline / candidate / control, and finally re-forms the
// object with the component that broke laid out beside it for inspection.
// Loaded lazily; Story.tsx falls back to a still image without WebGL.

/* eslint-disable react/immutability -- React Three Fiber's pattern: three.js objects are mutated each frame, outside React's render. */

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { heldState, runTime, shortName, type StoryData, type StoryNode } from './storyData'

export interface SceneProps {
  data: StoryData
  /** Story position: 0 hero, 1 connect, 2 assumption, 3 experiment, 4 result. Written by Story.tsx on scroll. */
  progress: RefObject<number>
  /** Readouts placed in the scene, by key: rel, col-0…3, limit, fail. */
  huds: RefObject<Record<string, HTMLElement | null>>
  reduced: boolean
  compact: boolean
  active: boolean
}

export default function DominoScene(props: SceneProps) {
  return (
    <Canvas
      className="story-canvas"
      dpr={[1, props.compact ? 1.5 : 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: 30, near: 0.1, far: 90, position: [3.2, 2.4, 8.2] }}
      frameloop={!props.active ? 'never' : props.reduced ? 'demand' : 'always'}
    >
      <Lighting />
      <Stage {...props} />
    </Canvas>
  )
}

// ---------- Small maths ----------
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (x: number) => {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}
/** 0 before `a`, 1 after `b`, eased between. */
const ramp = (s: number, a: number, b: number) => smooth((s - a) / (b - a))
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)



// ---------- Look ----------
const SOURCE_COLORS = ['#7cc6ff', '#9be3c3', '#b9a8ff', '#f4c27a', '#ff9f8a']
const WIRE = '#a9dcff'
const AMBER = '#ffb454'
const SIGNAL = '#ff5a3c'
const SIGNAL_COLOR = new THREE.Color(SIGNAL)
const WIRE_COLOR = new THREE.Color(WIRE)
const TILE = { w: 1, h: 2, d: 0.26 }
const FLOOR = -1.0
/** Height of the limit line inside the sandbox; measurements are scaled to it. */
const LIMIT_H = 1.5

function Lighting() {
  const { gl, scene } = useThree()
  // A procedural studio for reflections: no network fetch for an HDR file.
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const env = pmrem.fromScene(room, 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.55
    return () => {
      scene.environment = null
      env.dispose()
      room.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return (
    <>
      <ambientLight intensity={0.12} />
      {/* Cool key from above left, warm rim from behind right, a cool back light, a low fill from the plinth. */}
      <directionalLight position={[-5, 9, 6]} intensity={1.7} color="#e2ecff" />
      <directionalLight position={[6, 3, -7]} intensity={2.6} color="#ffb48a" />
      <directionalLight position={[0, 6, -8]} intensity={1.2} color="#9fc6ff" />
      <pointLight position={[0, -0.6, 3]} intensity={5} distance={9} color="#3d7aa8" />
    </>
  )
}

// Pip layouts for 1–6 on a tile's upper half (offsets in tile units).
const PIPS: [number, number][][] = [
  [],
  [[0, 0]],
  [[-1, 1], [1, -1]],
  [[-1, 1], [0, 0], [1, -1]],
  [[-1, 1], [1, 1], [-1, -1], [1, -1]],
  [[-1, 1], [1, 1], [0, 0], [-1, -1], [1, -1]],
  [[-1, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [1, -1]],
]

function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** The component's name printed on the lower half of its face, like a part label. */
function drawFace(canvas: HTMLCanvasElement, node: StoryNode, accent: string) {
  const g = canvas.getContext('2d')!
  const W = canvas.width
  const H = canvas.height
  const ink = node.step === 0 ? '#1a1c1f' : '#e7edf3'
  const dim = node.step === 0 ? '#6b665c' : '#8796a4'
  g.clearRect(0, 0, W, H)
  g.textBaseline = 'top'
  g.fillStyle = dim
  g.font = `500 ${W * 0.075}px "JetBrains Mono Variable", ui-monospace, monospace`
  g.fillText((node.step === 0 ? 'proposed change' : node.kind).toUpperCase(), W * 0.1, H * 0.1)
  // Name, wrapped to two lines at most.
  g.fillStyle = ink
  const size = W * 0.13
  g.font = `500 ${size}px "Instrument Sans Variable", system-ui, sans-serif`
  const lines: string[] = []
  for (const w of shortName(node).split(' ')) {
    const cur = lines[lines.length - 1]
    if (cur && g.measureText(`${cur} ${w}`).width < W * 0.82) lines[lines.length - 1] = `${cur} ${w}`
    else lines.push(w)
  }
  lines.slice(0, 2).forEach((l, i) => g.fillText(l, W * 0.1, H * 0.26 + i * size * 1.12))
  if (node.source) {
    g.fillStyle = accent
    g.fillRect(W * 0.1, H * 0.79, W * 0.05, W * 0.05)
    g.fillStyle = dim
    g.font = `400 ${W * 0.065}px "JetBrains Mono Variable", ui-monospace, monospace`
    g.fillText(node.source, W * 0.19, H * 0.785)
  }
}

const glass = (color: string, opacity: number) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false })

/** Geometry, materials and face textures; disposed with the scene. */
function useAssets(data: StoryData) {
  const assets = useMemo(() => {
    const geo = {
      body: new RoundedBoxGeometry(TILE.w, TILE.h, TILE.d, 5, 0.085),
      groove: new THREE.BoxGeometry(TILE.w * 0.74, 0.03, 0.012),
      edge: new THREE.BoxGeometry(0.03, TILE.h * 0.82, TILE.d * 0.5),
      pip: new THREE.CylinderGeometry(0.07, 0.07, 0.014, 24).rotateX(Math.PI / 2),
      face: new THREE.PlaneGeometry(TILE.w * 0.92, TILE.h * 0.46),
      plinth: new THREE.CylinderGeometry(1, 1.05, 0.14, 96),
      plinthRing: new THREE.TorusGeometry(1.01, 0.005, 8, 160).rotateX(Math.PI / 2),
      shadow: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      dot: new THREE.SphereGeometry(0.035, 10, 8),
      pulse: new THREE.SphereGeometry(0.05, 12, 10),
      ring: new THREE.TorusGeometry(1.0, 0.01, 8, 120),
      unitBox: new THREE.BoxGeometry(1, 1, 1),
      unitEdges: new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      column: new THREE.BoxGeometry(0.2, 1, 0.2).translate(0, 0.5, 0),
      bar: new THREE.BoxGeometry(1, 0.012, 0.012),
      sheet: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    }

    const sourceColor = (s: string | null) => SOURCE_COLORS[Math.max(0, data.sources.indexOf(s ?? '')) % SOURCE_COLORS.length]
    const graphite = new THREE.MeshPhysicalMaterial({
      color: '#141920',
      metalness: 0.6,
      roughness: 0.34,
      clearcoat: 0.9,
      clearcoatRoughness: 0.2,
      transparent: true,
    })
    const ivory = new THREE.MeshPhysicalMaterial({
      color: '#ece5d6',
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      emissive: '#fff4e0',
      emissiveIntensity: 0.04,
      transparent: true,
    })
    // One body material per component so each can step back on its own.
    const bodies = data.path.map((n) => {
      const m = (n.step === 0 ? ivory : graphite).clone()
      if (n.step === data.breaks) {
        m.emissive = new THREE.Color(SIGNAL)
        m.emissiveIntensity = 0
      } else if (data.assumption && n.step === data.assumption.to) {
        m.emissive = new THREE.Color(AMBER)
        m.emissiveIntensity = 0
      }
      return m
    })
    graphite.dispose()
    ivory.dispose()
    const canvases = data.path.map(() => {
      const c = document.createElement('canvas')
      c.width = 256
      c.height = 236
      return c
    })
    const faceTex = canvases.map((c) => {
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      return t
    })
    const draw = () =>
      data.path.forEach((n, i) => {
        drawFace(canvases[i], n, sourceColor(n.source))
        faceTex[i].needsUpdate = true
      })
    draw()
    const faces = faceTex.map((map) => new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false }))
    const pipMats = data.path.map((n) => {
      if (n.step === 0) return new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.45, transparent: true })
      const c = sourceColor(n.source)
      return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.3, toneMapped: false, transparent: true })
    })
    const edgeMats = data.path.map((n) => glass(n.step === 0 ? '#c9bfa8' : sourceColor(n.source), 0.9))
    const glow = glowTexture()
    const halo = (color: string) =>
      new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
    const shadowTex = glowTexture()

    return {
      geo,
      draw,
      mat: {
        bodies,
        faces,
        pipMats,
        edgeMats,
        groove: new THREE.MeshStandardMaterial({ color: '#07090c', roughness: 0.6, transparent: true }),
        plinth: new THREE.MeshPhysicalMaterial({ color: '#0b1016', metalness: 0.85, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15 }),
        plinthRing: glass(WIRE, 0.55),
        shadow: new THREE.MeshBasicMaterial({ map: shadowTex, color: '#000000', transparent: true, opacity: 0.7, depthWrite: false }),
        link: glass(WIRE, 0.9),
        assumption: glass(AMBER, 0.9),
        ring: glass(AMBER, 0),
        boxFill: glass(WIRE, 0),
        boxEdge: new THREE.LineBasicMaterial({ color: WIRE, transparent: true, opacity: 0, toneMapped: false }),
        columns: data.trio.map((r) => glass(r.outcome === 'pass' ? '#dcecf8' : SIGNAL, 0)),
        limitBar: glass(AMBER, 0),
        limitSheet: glass(AMBER, 0),
        haloChange: halo('#ffe9c7'),
        haloSignal: halo(SIGNAL),
      },
      textures: [glow, shadowTex, ...faceTex],
    }
  }, [data])

  // Faces are drawn with the page's fonts; redraw once they've loaded.
  useEffect(() => {
    let live = true
    document.fonts?.ready.then(() => {
      if (live) assets.draw()
    })
    return () => {
      live = false
    }
  }, [assets])

  useEffect(
    () => () => {
      Object.values(assets.geo).forEach((g) => g.dispose())
      const { bodies, faces, pipMats, edgeMats, columns, ...rest } = assets.mat
      ;[...bodies, ...faces, ...pipMats, ...edgeMats, ...columns, ...Object.values(rest)].forEach((m) => m.dispose())
      assets.textures.forEach((t) => t.dispose())
    },
    [assets],
  )
  return assets
}

// ---------- Layout ----------
interface Pose {
  pos: THREE.Vector3
  rot: THREE.Quaternion
}
const pose = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Pose => ({
  pos: v3(x, y, z),
  rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
})

/**
 * Three arrangements per component. Assembled: standing face to face on the
 * plinth with a slight twist, the change at the front. Unfolded: the change at
 * the front, the rest on an arc behind it in path order, left to right.
 * Concluded: assembled again, with the component that broke laid face up
 * beside the stack. Plus the sandbox around the end of the path and its
 * measurement columns.
 */
function layout(data: StoryData) {
  const n = data.path.length
  const y0 = FLOOR + TILE.h / 2
  const assembled = data.path.map((_, i) => pose(Math.sin(i * 0.9) * 0.08, y0, ((n - 1) / 2 - i) * 0.4, 0, -0.32 + i * 0.07, 0))
  const unfolded = data.path.map((node, i) => {
    if (i === 0) return pose(0, y0, 1.7)
    const t = (i - 1) / Math.max(1, n - 2)
    const ang = THREE.MathUtils.degToRad(160 - t * 140)
    const x = Math.cos(ang) * 3.1
    const z = -Math.sin(ang) * 1.5 + 0.1
    const leans = data.assumption && node.step === data.assumption.to
    return pose(x, y0, z, 0, Math.atan2(-x, 9 - z) * 0.7, leans ? -0.16 : 0)
  })
  const concluded = assembled.map((p, i) => (i === data.breaks ? pose(2.0, FLOOR + TILE.d / 2 + 0.01, 0.6, -Math.PI / 2, 0, 0.5) : p))

  const curves = data.links.map((l) => {
    const a = unfolded[l.from].pos
    const b = unfolded[l.to].pos
    const mid = a.clone().add(b).multiplyScalar(0.5).add(v3(0, 1.25, 0.25))
    return new THREE.QuadraticBezierCurve3(a.clone().add(v3(0, 0.6, 0)), mid, b.clone().add(v3(0, 0.6, 0)))
  })
  const assumptionIndex = data.assumption ? data.links.indexOf(data.assumption) : -1
  const focus = assumptionIndex >= 0 ? curves[assumptionIndex].getPoint(0.5) : unfolded[n - 1].pos.clone()

  // The sandbox: around the last components on the path, the ones the experiment exercises.
  const last = data.assumption ? data.assumption.to : n - 1
  const inBox = new Set<number>()
  const box = new THREE.Box3()
  for (let i = Math.max(1, last - 2); i <= last; i++) {
    inBox.add(i)
    box.expandByPoint(unfolded[i].pos)
  }
  box.min.add(v3(-0.85, -1.05, -0.7))
  box.max.add(v3(0.85, 1.35, 1.9))
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  // Measurement columns stand in a row along the front of the sandbox.
  const count = data.trio.length
  const columns = Array.from({ length: count }, (_, i) => v3(center.x + (i - (count - 1) / 2) * 0.72, FLOOR, box.max.z - 0.45))

  return { assembled, unfolded, concluded, curves, assumptionIndex, focus, inBox, box: { center, size }, columns }
}

type Key = { pos: THREE.Vector3; look: THREE.Vector3; fx: number; fy: number }

// ---------- Scene ----------
function Stage({ data, progress, huds, reduced, compact }: SceneProps) {
  const assets = useAssets(data)
  const L = useMemo(() => layout(data), [data])
  const { camera, size, invalidate } = useThree()

  const group = useRef<THREE.Group>(null)
  const tiles = useRef<(THREE.Group | null)[]>([])
  const links = useRef<(THREE.Mesh | null)[]>([])
  const dots = useRef<THREE.InstancedMesh>(null)
  const pulses = useRef<(THREE.Mesh | null)[]>([])
  const ring = useRef<THREE.Mesh>(null)
  const sandbox = useRef<THREE.Group>(null)
  const cols = useRef<(THREE.Mesh | null)[]>([])
  const limitLine = useRef<THREE.Group>(null)
  const haloChange = useRef<THREE.Sprite>(null)
  const haloSignal = useRef<THREE.Sprite>(null)
  const plinth = useRef<THREE.Group>(null)
  const particles = useRef<THREE.Points>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const smoothed = useRef<number | null>(null)
  const startedAt = useRef<number | null>(null)
  const widths = useMemo(() => new WeakMap<HTMLElement, number>(), [])

  const DOTS = 28
  const exp = data.experiment
  const limitValue = exp?.limit?.value ?? null
  const runs = data.trio
  const runValues = runs.map((r) => (typeof r.value === 'number' ? r.value : null))
  const scaleTo = limitValue ?? Math.max(1, ...runValues.map((v) => v ?? 0)) / 1.3
  const heights = runValues.map((v) => (v == null ? 0 : (v / scaleTo) * LIMIT_H))
  // When each run plays during chapter 3, in story time (Story.tsx marks the same moments).
  const runAt = runs.map((_, i) => runTime(i, runs.length))
  const controlAt = runAt[runs.findIndex((r) => r.variant === 'control')] ?? 9

  const linkGeos = useMemo(
    () => L.curves.map((c, i) => (i === L.assumptionIndex ? null : new THREE.TubeGeometry(c, 72, 0.014, 8, false))),
    [L],
  )
  useEffect(() => () => linkGeos.forEach((g) => g?.dispose()), [linkGeos])

  // Fine dust in the depth behind the object.
  const dust = useMemo(() => {
    let seed = 11
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    const count = compact ? 160 : 320
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (rand() - 0.5) * 30
      arr[i * 3 + 1] = (rand() - 0.5) * 16
      arr[i * 3 + 2] = -rand() * 18 - 2
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    const mat = new THREE.PointsMaterial({ color: '#9cc3e0', size: 0.035, transparent: true, opacity: 0.45, depthWrite: false })
    return { geo, mat }
  }, [compact])
  useEffect(
    () => () => {
      dust.geo.dispose()
      dust.mat.dispose()
    },
    [dust],
  )

  // Demand rendering (reduced motion) still needs a frame when the page scrolls.
  useEffect(() => {
    if (!reduced) return
    const redraw = () => invalidate()
    window.addEventListener('scroll', redraw, { passive: true })
    return () => window.removeEventListener('scroll', redraw)
  }, [reduced, invalidate])

  useEffect(() => {
    if (reduced || compact) return
    const move = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => window.removeEventListener('pointermove', move)
  }, [reduced, compact])

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    return () => cam.clearViewOffset()
  }, [camera])

  const scratch = useMemo(
    () => ({
      camPos: new THREE.Vector3(),
      camTarget: new THREE.Vector3(),
      tmp: new THREE.Vector3(),
      tmp2: new THREE.Vector3(),
      anchor: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      tip: new THREE.Quaternion(),
      dummy: new THREE.Object3D(),
    }),
    [],
  )

  /**
   * Camera stops: two per chapter (it drifts a little while a chapter holds),
   * with where the focus should sit on screen (fx, fy: fractions of the view
   * from centre) so the copy around it has room.
   */
  const keys = useMemo(() => {
    const sb = L.box.center.clone().add(v3(0, 0.1, 0.6))
    const k = (pos: THREE.Vector3, look: THREE.Vector3, fx: number, fy: number): Key => ({ pos, look, fx, fy })
    const f = L.focus
    const stops: [Key, Key][] = [
      [k(v3(4.4, 2.9, 10.4), v3(0, -0.1, 0), 0, 0.03), k(v3(3.5, 2.6, 10.9), v3(0, -0.1, 0), 0, 0.03)],
      [k(v3(0.3, 2.9, 12.6), v3(0, -0.05, 0.2), 0, -0.07), k(v3(-0.6, 2.7, 12.3), v3(0, -0.05, 0.2), 0, -0.07)],
      [k(f.clone().add(v3(-2.6, 1.3, 8.4)), f.clone().add(v3(0, -0.5, 0)), -0.17, 0.03), k(f.clone().add(v3(-1.9, 1.1, 8.2)), f.clone().add(v3(0, -0.5, 0)), -0.17, 0.03)],
      [k(sb.clone().add(v3(-2.6, 3.0, 15.4)), sb.clone(), 0.15, 0.02), k(sb.clone().add(v3(-1.8, 2.8, 15.2)), sb.clone(), 0.15, 0.02)],
      [k(v3(4.8, 3.1, 13.4), v3(0.7, -0.3, 0.2), 0, -0.17), k(v3(4.0, 2.9, 13.8), v3(0.7, -0.3, 0.2), 0, -0.17)],
    ]
    return stops
  }, [L])

  useFrame((state, delta) => {
    const { camPos, camTarget, tmp, tmp2, q, tip, dummy } = scratch
    const raw = progress.current ?? 0
    const target = reduced ? heldState(raw) : raw
    // Ease toward the scroll position so the camera glides rather than jumps.
    smoothed.current = reduced || smoothed.current == null ? target : THREE.MathUtils.damp(smoothed.current, target, 3.4, delta)
    const s = smoothed.current
    const t = state.clock.elapsedTime
    startedAt.current ??= t
    const intro = reduced ? 1 : smooth((t - startedAt.current) / 2.2)
    const motion = reduced ? 0 : 1

    // ----- Story timeline (chapter n holds from n − 0.25 to n + 0.25) -----
    const drawn = data.links.map((_, i) => ramp(s, 0.72 + i * 0.07, 0.86 + i * 0.07))
    const focusIn = ramp(s, 1.3, 1.7) * (1 - ramp(s, 3.3, 3.65))
    const emphasis = ramp(s, 1.4, 1.75) * (1 - ramp(s, 2.5, 2.8))
    const hypothesis = ramp(s, 1.75, 1.95) * (1 - ramp(s, 2.35, 2.6))
    const sandboxIn = ramp(s, 2.3, 2.6) * (1 - ramp(s, 3.3, 3.55))
    const rise = runAt.map((at) => ramp(s, at, at + 0.07))
    const failRise = runs.map((r, i) => (r.outcome !== 'pass' ? rise[i] : 0))
    const tipped = data.breaks >= 0 ? Math.max(0, ...failRise) * (1 - ramp(s, controlAt, controlAt + 0.06)) : 0
    const conclude = ramp(s, 3.3, 3.75)
    const fallen = data.breaks >= 0 ? conclude : 0
    const linksOut = Math.max(ramp(s, 2.35, 2.6) * 0.65, conclude)

    // ----- Camera: hold within a chapter, travel between chapters -----
    const c = Math.min(4, Math.max(0, s))
    const n = Math.round(c)
    let a: Key
    let b: Key
    let f: number
    if (Math.abs(c - n) <= 0.25) {
      ;[a, b] = keys[n]
      f = smooth((c - (n - 0.25)) / 0.5)
    } else {
      const from = c > n ? n : n - 1
      a = keys[from][1]
      b = keys[from + 1][0]
      f = smooth((c - (from + 0.25)) / 0.5)
    }
    camPos.lerpVectors(a.pos, b.pos, f)
    camTarget.lerpVectors(a.look, b.look, f)
    let fx = THREE.MathUtils.lerp(a.fx, b.fx, f)
    let fy = THREE.MathUtils.lerp(a.fy, b.fy, f)
    camPos.x += pointer.current.x * 0.35 * motion
    camPos.y -= pointer.current.y * 0.2 * motion
    camPos
      .sub(camTarget)
      .multiplyScalar((compact ? THREE.MathUtils.lerp(1.8, 1.45, ramp(s, 0.25, 0.75)) : 1) + (1 - intro) * 0.35)
      .add(camTarget)
    if (compact) {
      // Stacked layouts: centred, a little lower in the hero, higher once copy scrolls in below.
      fx = 0
      fy = THREE.MathUtils.lerp(size.width > size.height ? 0.03 : 0.05, -0.06, ramp(s, 0.25, 0.75))
    }
    camera.position.copy(camPos)
    camera.lookAt(camTarget)
    // Readouts are projected below; use this frame's camera, not last frame's (it can jump under reduced motion).
    camera.updateMatrixWorld()
    const cam = camera as THREE.PerspectiveCamera
    cam.setViewOffset(size.width, size.height, -fx * size.width, -fy * size.height, size.width, size.height)

    // ----- Components -----
    const idle = (1 - ramp(s, 0.25, 0.6)) * motion
    if (group.current) group.current.rotation.y = idle * (Math.sin(t * 0.25) * 0.16 + 0.12)
    L.unfolded.forEach((_, i) => {
      const obj = tiles.current[i]
      if (!obj) return
      const e = ramp(s, 0.3 + i * 0.04, 0.68 + i * 0.03)
      const r = ramp(s, 3.3 + i * 0.03, 3.72 + i * 0.02)
      if (r > 0) {
        obj.position.lerpVectors(L.unfolded[i].pos, L.concluded[i].pos, r)
        obj.quaternion.slerpQuaternions(L.unfolded[i].rot, L.concluded[i].rot, r)
      } else {
        obj.position.lerpVectors(L.assembled[i].pos, L.unfolded[i].pos, e)
        obj.quaternion.slerpQuaternions(L.assembled[i].rot, L.unfolded[i].rot, e)
      }
      obj.position.y -= (1 - intro) * (1.2 + i * 0.15)

      // In the sandbox the component that breaks tips forward over its base edge, and stands again for the control.
      if (i === data.breaks && tipped > 0 && r === 0) {
        tip.setFromAxisAngle(tmp.set(1, 0, 0), tipped * 0.55)
        q.copy(obj.quaternion)
        tmp.set(0, 1, 0).applyQuaternion(q)
        obj.quaternion.multiply(tip)
        tmp2.set(0, 1, 0).applyQuaternion(obj.quaternion)
        obj.position.add(tmp2.sub(tmp).multiplyScalar(TILE.h / 2))
      }

      // Supporting components step back while one relationship is in focus.
      const inFocus = data.assumption
        ? s < 2.4
          ? i === data.assumption.from || i === data.assumption.to
          : L.inBox.has(i)
        : true
      const o = 1 - (inFocus ? 0 : focusIn * 0.85)
      // Opaque while fully shown, so a body hides the faces behind it; transparent only while it steps back.
      const body = assets.mat.bodies[i]
      if (body.transparent !== o < 0.999) {
        body.transparent = o < 0.999
        body.needsUpdate = true
      }
      body.opacity = o
      assets.mat.faces[i].opacity = o
      assets.mat.pipMats[i].opacity = o
      assets.mat.edgeMats[i].opacity = 0.9 * o
    })
    if (data.breaks >= 0) assets.mat.bodies[data.breaks].emissiveIntensity = Math.max(tipped, fallen) * 0.32
    if (data.assumption && data.assumption.to !== data.breaks) assets.mat.bodies[data.assumption.to].emissiveIntensity = emphasis * 0.08

    // ----- Links -----
    links.current.forEach((m, i) => {
      if (!m) return
      const geo = m.geometry as THREE.TubeGeometry
      const total = geo.index ? geo.index.count : 0
      geo.setDrawRange(0, Math.floor((total * drawn[i]) / 6) * 6)
      m.visible = drawn[i] > 0.001 && linksOut < 0.999
    })
    assets.mat.link.opacity = 0.85 * (1 - emphasis * 0.55) * (1 - linksOut)

    // The inferred link is dotted: it wasn't read from a retrieved row.
    if (dots.current && L.assumptionIndex >= 0) {
      const curve = L.curves[L.assumptionIndex]
      const shown = Math.floor(DOTS * drawn[L.assumptionIndex])
      for (let d = 0; d < DOTS; d++) {
        curve.getPoint(d / (DOTS - 1), tmp)
        dummy.position.copy(tmp)
        const beat = 1 + emphasis * 0.5 * Math.sin(t * 3 - d * 0.5) * motion
        dummy.scale.setScalar(d < shown && conclude < 0.99 ? beat * (1 + emphasis * 0.4) : 0)
        dummy.updateMatrix()
        dots.current.setMatrixAt(d, dummy.matrix)
      }
      dots.current.instanceMatrix.needsUpdate = true
      assets.mat.assumption.opacity = (0.7 + emphasis * 0.3) * (1 - conclude)
    }
    pulses.current.forEach((m, i) => {
      if (!m) return
      m.visible = motion > 0 && drawn[i] >= 1 && i !== L.assumptionIndex && emphasis < 0.5 && linksOut < 0.3
      if (m.visible) L.curves[i].getPoint((t * 0.3 + i * 0.21) % 1, m.position)
    })

    // ----- Hypothesis: a bracket of attention around the inferred link -----
    if (ring.current) {
      ring.current.visible = hypothesis > 0.001
      ring.current.position.copy(L.focus)
      ring.current.lookAt(camera.position)
      ring.current.rotateZ(t * 0.12 * motion)
      ring.current.scale.setScalar(0.95 + 0.15 * hypothesis)
      assets.mat.ring.opacity = hypothesis * 0.8
    }

    // ----- Sandbox and measurements -----
    if (sandbox.current) {
      sandbox.current.visible = sandboxIn > 0.001
      sandbox.current.scale.setScalar(0.96 + 0.04 * sandboxIn)
      assets.mat.boxFill.opacity = sandboxIn * 0.05
      assets.mat.boxEdge.opacity = sandboxIn * 0.6
    }
    cols.current.forEach((m, i) => {
      if (!m) return
      m.scale.y = Math.max(0.001, heights[i] * rise[i])
      m.visible = sandboxIn > 0.001 && heights[i] > 0
      assets.mat.columns[i].opacity = sandboxIn * (rise[i] > 0 ? 0.9 : 0)
    })
    if (limitLine.current) limitLine.current.visible = sandboxIn > 0.001 && limitValue != null
    assets.mat.limitBar.opacity = sandboxIn
    assets.mat.limitSheet.opacity = sandboxIn * 0.09

    // ----- Plinth ring and halos -----
    if (plinth.current) {
      const r = THREE.MathUtils.lerp(THREE.MathUtils.lerp(1.45, 3.7, ramp(s, 0.3, 0.75)), 2.5, conclude)
      plinth.current.scale.set(r, 1, r * 0.82)
    }
    assets.mat.plinthRing.color.copy(WIRE_COLOR).lerp(SIGNAL_COLOR, fallen * 0.85)
    assets.mat.plinthRing.opacity = 0.35 + 0.3 * (1 - focusIn) + 0.2 * fallen
    const ch = tiles.current[0]
    if (haloChange.current && ch) {
      haloChange.current.position.copy(ch.position).add(tmp.set(0, 0.2, -0.5))
      assets.mat.haloChange.opacity = (0.22 + 0.25 * ramp(s, 0.6, 1)) * (1 - focusIn) * intro
    }
    const br = data.breaks >= 0 ? tiles.current[data.breaks] : null
    if (haloSignal.current && br) {
      haloSignal.current.position.copy(br.position).add(tmp.set(0, 0.3, -0.3))
      assets.mat.haloSignal.opacity = Math.max(tipped * 0.6, fallen * 0.75)
    }
    if (particles.current) {
      particles.current.rotation.y = t * 0.01 * motion
      dust.mat.opacity = 0.45 * intro
    }

    group.current?.updateMatrixWorld()
    tiles.current.forEach((t) => t?.updateMatrixWorld())
    placeHuds(state.camera, { emphasis, sandboxIn, rise, fallen })
  })

  /** Projects each readout's anchor (in the object's space) to the screen; fades it by chapter. */
  function placeHuds(cam: THREE.Camera, a: { emphasis: number; sandboxIn: number; rise: number[]; fallen: number }) {
    const { tmp, anchor } = scratch
    const w = size.width
    const h = size.height
    const hud = huds.current ?? {}
    const show = (el: HTMLElement | null | undefined, local: THREE.Vector3, alpha: number, centred = true) => {
      if (!el) return
      if (alpha <= 0.001) {
        el.style.opacity = '0'
        return
      }
      tmp.copy(local)
      group.current?.localToWorld(tmp)
      tmp.project(cam)
      let width = widths.get(el)
      if (width == null) {
        width = el.offsetWidth
        widths.set(el, width)
      }
      let x = ((tmp.x + 1) / 2) * w
      // Readouts stay fully on screen.
      x = centred ? Math.min(w - width / 2 - 8, Math.max(width / 2 + 8, x)) : Math.min(w - width - 8, x)
      el.style.transform = `translate3d(${x}px, ${((1 - tmp.y) / 2) * h}px, 0)`
      el.style.opacity = tmp.z > 1 ? '0' : alpha.toFixed(3)
    }
    if (L.assumptionIndex >= 0) {
      L.curves[L.assumptionIndex].getPoint(0.5, anchor)
      show(hud.rel, anchor.add(UP_A_LITTLE), a.emphasis * (1 - a.sandboxIn))
    }
    L.columns.forEach((c, i) => {
      anchor.copy(c).y += heights[i] * a.rise[i] + 0.12
      show(hud[`col-${i}`], anchor, a.sandboxIn * ramp(a.rise[i], 0.6, 1))
    })
    if (L.columns.length) {
      anchor.copy(L.columns[L.columns.length - 1])
      anchor.x += 0.42
      anchor.y += LIMIT_H
      show(hud.limit, anchor, a.sandboxIn, false)
    }
    const br = data.breaks >= 0 ? tiles.current[data.breaks] : null
    if (br) {
      anchor.copy(br.position)
      anchor.y += 0.8
      show(hud.fail, anchor, a.fallen)
    }
  }

  const { geo, mat } = assets
  return (
    <>
      <points ref={particles} geometry={dust.geo} material={dust.mat} />
      <group ref={group}>
        {/* The plinth widens as the object unfolds across it, and narrows as it re-forms. */}
        <group ref={plinth} position={[0, 0, 0.3]}>
          <mesh geometry={geo.plinth} material={mat.plinth} position={[0, FLOOR - 0.07, 0]} />
          <mesh geometry={geo.plinthRing} material={mat.plinthRing} position={[0, FLOOR + 0.001, 0]} />
          <mesh geometry={geo.shadow} material={mat.shadow} position={[0, FLOOR + 0.002, 0]} scale={[1.4, 1, 1.4]} />
        </group>

        {data.path.map((node, i) => {
          const pips = PIPS[Math.min(6, Math.max(1, node.rows))]
          return (
            <group
              key={node.id}
              ref={(el) => {
                tiles.current[i] = el
              }}
            >
              <mesh geometry={geo.body} material={mat.bodies[i]} />
              {[1, -1].map((side) => (
                <mesh key={side} geometry={geo.groove} material={mat.groove} position={[0, 0, (side * TILE.d) / 2]} />
              ))}
              {/* A thin stripe in the source system's colour along each long edge. */}
              {[1, -1].map((side) => (
                <mesh key={`e${side}`} geometry={geo.edge} material={mat.edgeMats[i]} position={[side * (TILE.w / 2 + 0.002), 0, 0]} />
              ))}
              {pips.map(([px, py], j) => (
                <mesh key={j} geometry={geo.pip} material={mat.pipMats[i]} position={[px * 0.22, 0.52 + py * 0.22, TILE.d / 2 + 0.002]} />
              ))}
              <mesh geometry={geo.face} material={mat.faces[i]} position={[0, -0.5, TILE.d / 2 + 0.004]} />
            </group>
          )
        })}

        {linkGeos.map((g, i) =>
          g ? (
            <mesh
              key={i}
              geometry={g}
              material={mat.link}
              ref={(el) => {
                links.current[i] = el
              }}
            />
          ) : null,
        )}
        {L.assumptionIndex >= 0 && <instancedMesh ref={dots} args={[geo.dot, mat.assumption, DOTS]} />}
        {data.links.map((_, i) => (
          <mesh
            key={i}
            geometry={geo.pulse}
            material={mat.link}
            visible={false}
            ref={(el) => {
              pulses.current[i] = el
            }}
          />
        ))}

        <mesh ref={ring} geometry={geo.ring} material={mat.ring} visible={false} />

        <group ref={sandbox} position={L.box.center} visible={false}>
          <mesh geometry={geo.unitBox} material={mat.boxFill} scale={L.box.size} />
          <lineSegments geometry={geo.unitEdges} material={mat.boxEdge} scale={L.box.size} />
        </group>
        {L.columns.map((c, i) => (
          <mesh
            key={i}
            geometry={geo.column}
            material={mat.columns[i]}
            position={c}
            visible={false}
            ref={(el) => {
              cols.current[i] = el
            }}
          />
        ))}
        {L.columns.length > 0 && (
          <group ref={limitLine} position={[L.box.center.x, FLOOR + LIMIT_H, L.columns[0].z]} visible={false}>
            <mesh geometry={geo.bar} material={mat.limitBar} scale={[L.columns.length * 0.72 + 0.5, 1, 1]} />
            <mesh geometry={geo.sheet} material={mat.limitSheet} scale={[L.columns.length * 0.72 + 0.5, 1, 0.8]} />
          </group>
        )}

        <sprite ref={haloChange} material={mat.haloChange} scale={[4.4, 4.4, 1]} />
        <sprite ref={haloSignal} material={mat.haloSignal} scale={[3.6, 3.6, 1]} />
      </group>
    </>
  )
}

const UP_A_LITTLE = v3(0, 0.35, 0)

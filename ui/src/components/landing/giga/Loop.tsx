// Middle section 2: one continuous canvas scene in three chapters.
//   Connect: each source system is a grid of threads; they draw in and converge on Domino.
//   Test:    the node bursts into beads, one per measured row, settling into a cloud per case.
//   Decide:  the beads snap into rows, collapse onto a timeline, and the timeline forks at the
//            change: the control stays flat, the candidate climbs past the stated limit.
// A small 3D projection with a keyframed camera; scroll drives the story with holds per chapter.

import { useEffect, useMemo, useRef } from 'react'
import { href } from '../../../lib/router'
import { navigating } from '../../../lib/scroll'
import { jumpScroll } from '../../../lib/smoothScroll'
import type { CaseCard } from './data'

export interface LoopData {
  sources: { name: string; items: string[] }[]
  lanes: { name: string; rows: number; extra: number; runs: number }[]
  baseline: number
  candidate: number
  limit: number | null
  measure: string
  failed: boolean
}

const TAU = Math.PI * 2
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const span = (p: number, a: number, b: number) => clamp((p - a) / (b - a))
const smooth = (t: number) => t * t * (3 - 2 * t)
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const sine = (t: number) => (1 - Math.cos(Math.PI * t)) / 2
const out = (t: number) => 1 - Math.pow(1 - t, 3)

const INK = '31,29,27'
// A color part way from neutral ink to its own.
const tint = (from: string, rgb: string, t: number) => {
  const c = rgb.split(',').map(Number)
  const n = from.split(',').map(Number)
  return c.map((v, i) => Math.round(n[i] + (v - n[i]) * t)).join(',')
}
// Shades of orange the burst flies out in, before each bead finds its case.
const EMBERS = ['255,167,86', '240,138,50', '255,196,140', '226,112,40', '255,150,70', '250,180,120']
const MUTED = '150,144,136'
const ACCENT = '240,138,50'
const FAIL = '229,72,77'
const LANE_COLORS = ['240,138,50', '205,165,110', '122,110,170', '70,138,180', '96,160,122']

// Story timing: [scroll progress, scene progress] keys give each chapter a hold.
const KEYS: [number, number][] = [
  [0, 0.04],
  [0.1, 0.06],
  [0.25, 0.12],
  [0.36, 0.24],
  [0.47, 0.44],
  [0.53, 0.6],
  [0.6, 0.62],
  [0.645, 0.68],
  [0.74, 0.79],
  [0.88, 1],
  [1, 1],
]
const sceneAt = (p: number) => {
  for (let i = 1; i < KEYS.length; i++) if (p <= KEYS[i][0]) return mix(KEYS[i - 1][1], KEYS[i][1], span(p, KEYS[i - 1][0], KEYS[i][0]))
  return 1
}
const chapterAt = (p: number) => (p < 0.265 ? 0 : p < 0.645 ? 1 : 2)
// The chapter title covers the scene briefly as each chapter begins.
const coverAt = (p: number) =>
  Math.max(smoother(span(p, 0.035, 0.06)) * (1 - smoother(span(p, 0.11, 0.16))), smoother(span(p, 0.265, 0.29)) * (1 - smoother(span(p, 0.325, 0.37))), smoother(span(p, 0.645, 0.67)) * (1 - smoother(span(p, 0.705, 0.75))))
// The fastest the scene may advance, in story lengths per second (~5.5 s end to end).
const MAX_SPEED = 0.2
// How far the page may run ahead of the drawn scene, and where the story ends.
const LEAD = 0.02
const END_AT = 1.08
const STOPS = [0.12, 0.44, 0.93]
const CHAPTERS = [
  { key: 'connect', title: 'Connect.', sub: 'Find every part of the pipeline the change touches.' },
  { key: 'test', title: 'Test.', sub: 'Run it with and without the change.' },
  { key: 'decide', title: 'Decide.', sub: 'Code says what broke.' },
]

export function Loop({ data: fresh, cards }: { data: LoopData; cards: CaseCard[] }) {
  // The page re-renders when the site data is re-checked; rebuild the scene only
  // when the data itself changes, so the animation never restarts mid-scroll.
  const key = JSON.stringify(fresh)
  const data = useMemo(() => JSON.parse(key) as LoopData, [key])
  const sectionRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const section = sectionRef.current!
    const stage = stageRef.current!
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let seed = 20261027
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(TAU * rand())

    // ---- Threads: one grid per source system ----
    const START = -1050
    const PY = 9
    const PZ = 130
    const sources = data.sources.slice(0, 3).map((s, i) => ({ ...s, y: [215, 0, -215][i], depth: [120, -120, 40][i], rows: 9, cols: 3 }))
    const threads: { si: number; c: number; x: number; y: number; z: number; delay: number; alpha: number; srcY: number }[] = []
    sources.forEach((src, si) => {
      const top = src.y + ((src.rows - 1) * PY) / 2
      const near = src.depth - ((src.cols - 1) * PZ) / 2
      for (let r = 0; r < src.rows; r++)
        for (let c = 0; c < src.cols; c++)
          threads.push({ si, c, x: START + c * 28, y: top - r * PY, z: near + c * PZ, delay: r * 30 + c * 55, alpha: 0.18 + 0.22 * (1 - c / src.cols) + rand() * 0.06, srcY: src.y })
    })

    // ---- Beads: one per measured row, grouped by case ----
    const TODAY = 2400
    const END = 3250
    const ROW_X0 = 260
    const laneY = (li: number) => 260 - li * 120
    const lanes = data.lanes.slice(0, 5)
    const beads: { lane: number; hot: boolean; cloud: [number, number, number]; spread: [number, number, number]; ember: string; size: number; phase: number; rate: number; wander: [number, number, number, number]; run: number; runs: number; row: number; x: number; n: number; of: number }[] = []
    lanes.forEach((lane, li) => {
      const cx = [-720, -220, -420, 330, 740][li]
      const cy = [40, -170, 330, 300, -60][li]
      const cz = [140, -90, 60, -130, 110][li]
      const total = Math.min(300, lane.rows + lane.extra)
      const runs = Math.min(3, lane.runs)
      for (let run = 0; run < runs; run++)
        for (let i = 0; i < total; i++) {
          const reach = rand() < 0.12 ? 2.2 : 1
          beads.push({
            lane: li,
            hot: i >= Math.min(300, lane.rows),
            cloud: [cx + gauss() * 150 * reach, cy + gauss() * 110 * reach, cz + gauss() * 140 * reach],
            // first everything flies out evenly, a flat disc around the node
            spread: [gauss() * 640, gauss() * 230, gauss() * 640],
            ember: EMBERS[Math.floor(rand() * EMBERS.length)],
            size: 0.5 + rand() * rand() * 1.6,
            phase: rand() * TAU,
            rate: 0.6 + rand() * 1.1,
            // a slow wander of its own: two frequencies, two phases
            wander: [0.15 + rand() * 0.25, 0.1 + rand() * 0.2, rand() * TAU, rand() * TAU],
            run: run + 1,
            runs,
            row: run,
            x: ROW_X0 + ((i + rand() * 0.8) / total) * (TODAY - ROW_X0),
            n: i + 1,
            of: lane.rows + lane.extra,
          })
        }
    })

    // ---- The measurement as a curve ----
    const base = data.baseline
    const cand = data.candidate
    const lim = data.limit
    const topV = Math.max(cand, lim ?? cand, base + 1)
    const Y = (v: number) => ((v - base) / (topV - base)) * 340
    const history = () => 0
    const measured = (t: number) => (Math.exp(3.2 * t) - 1) / (Math.exp(3.2) - 1)
    const el = (x: number) => clamp((x - TODAY) / (END - TODAY))
    const control = () => 0
    const candidate = (x: number) => (x <= TODAY ? 0 : Y(cand) * measured(el(x)))
    const headAt = (p: number) => (p < 0.79 ? TODAY * sine(span(p, 0.3, 0.55)) : TODAY + (END - TODAY) * smoother(span(p, 0.79, 0.975)))

    // ---- Camera ----
    type Cam = { tx: number; ty: number; tz: number; ax: number; ay: number; yaw: number; pitch: number; d: number; s: number }
    const blend = (A: Cam, B: Cam, t: number): Cam => {
      const o = {} as Cam
      for (const k in A) {
        const key = k as keyof Cam
        o[key] = key === 'd' ? 1 / mix(1 / A.d, 1 / B.d, t) : key === 's' ? Math.exp(mix(Math.log(A.s), Math.log(B.s), t)) : mix(A[key], B[key], t)
      }
      return o
    }
    let W = 1440
    let H = 900
    let scale = 1
    let ox = 0
    let oy = 0
    let cam: Cam
    let cy = 1
    let sy = 0
    let cp = 1
    let sp = 0
    let f = 1
    const par = { x: 0, y: 0, tx: 0, ty: 0 }
    let back = 0
    let lift = 0
    let life = 0
    const aim = (p: number) => {
      const orbit = smooth(span(p, 0, 0.12))
      const build: Cam = { tx: -430, ty: 0, tz: 0, ax: 760, ay: 470, yaw: -0.24 - 0.16 * orbit, pitch: 0.22 + 0.08 * orbit, d: 2400, s: 0.9 + 0.065 * orbit }
      const centered: Cam = { tx: 0, ty: 0, tz: 0, ax: (W / 2 - ox) / scale, ay: (H / 2 - oy) / scale, yaw: -0.09, pitch: 0.12, d: 2100, s: 1.05 }
      const drift = span(p, 0.44, 0.7)
      // In rows the camera frames the bands and their labels.
      const rows = smoother(span(p, 0.46, 0.59))
      const rest: Cam = { tx: mix(90 * drift, 1150, rows), ty: mix(0, 40, rows), tz: 0, ax: 720, ay: 470, yaw: mix(-0.07 - 0.05 * drift, -0.03, rows), pitch: mix(0.19 - 0.04 * drift, 0.08, rows), d: 2300, s: mix(0.6, 0.52, rows) }
      const side: Cam = { tx: TODAY, ty: 120, tz: 0, ax: mix(1040, 560, smoother(span(p, 0.77, 0.99))), ay: 560, yaw: 0, pitch: 0, d: 2e5, s: mix(0.42, 0.74, smoother(span(p, 0.77, 0.99))) }
      cam = blend(build, centered, smoother(span(p, 0.075, 0.2)))
      cam = blend(cam, rest, smoother(span(p, 0.34, 0.44)))
      cam = blend(cam, side, smoother(span(p, 0.62, 0.76)))
      cam = blend(cam, build, back)
      // Fly through the burst: the camera moves in close, then pulls back.
      const fly = Math.sin(Math.PI * span(p, 0.25, 0.4))
      if (fly > 0) {
        const k = 1 - 0.62 * fly * fly
        cam.s /= k
        cam.d *= k
      }
      // While the section header is up, the scene waits below it.
      cam.ay += lift * 230
      const depth = clamp((4000 - cam.d) / 3050)
      cam.yaw += par.x * 0.3 * depth
      cam.pitch += par.y * 0.18 * depth
      cy = Math.cos(cam.yaw)
      sy = Math.sin(cam.yaw)
      cp = Math.cos(cam.pitch)
      sp = Math.sin(cam.pitch)
      f = cam.s * cam.d
    }
    const P = { x: 0, y: 0, k: 1 }
    const LENS_R = 150
    // The cursor, eased, in canvas pixels; on fades in and out with it.
    const lens = { x: -999, y: -999, tx: -999, ty: -999, on: 0, want: 0 }
    const project = (x: number, y: number, z: number) => {
      const vx = x - cam.tx
      const vy = y - cam.ty
      const vz = z - cam.tz
      const x1 = vx * cy - vz * sy
      const z1 = vx * sy + vz * cy
      const y2 = vy * cp + z1 * sp
      const depth = Math.max(40, cam.d - vy * sp + z1 * cp)
      P.x = cam.ax + (f * x1) / depth
      P.y = cam.ay - (f * y2) / depth
      P.k = cam.d / depth
      // Near the cursor the scene bends: a soft pull, a slight sag and a ripple.
      if (lens.on > 0.002) {
        const sx = P.x * scale + ox - lens.x
        const sy = P.y * scale + oy - lens.y
        const d2 = sx * sx + sy * sy
        if (d2 < LENS_R * LENS_R) {
          const d = Math.sqrt(d2)
          let k = 1 - d / LENS_R
          k = k * k * (3 - 2 * k) * lens.on
          P.x -= (sx * 0.16 * k) / scale
          P.y += (-sy * 0.16 * k + 9 * k + Math.sin(d * 0.085 - life * 4.5) * 2.2 * k) / scale
        }
      }
      return P
    }
    const threadPoint = (th: (typeof threads)[number], t: number) => {
      const gather = smooth(clamp(t / 0.5))
      const merge = smoother(clamp((t - 0.3) / 0.7))
      return project(mix(th.x, 0, t), mix(th.y, mix(th.srcY, 0, merge), gather), th.z * (1 - gather))
    }

    // ---- Sprites for soft lights ----
    const glow = (color: string) => {
      // A smooth, gaussian-like falloff at a size that does not band when scaled up.
      const c = document.createElement('canvas')
      c.width = c.height = 256
      const g = c.getContext('2d')!
      const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128)
      for (let i = 0; i <= 16; i++) {
        const t = i / 16
        gr.addColorStop(t, `rgba(${color},${(0.55 * Math.exp(-t * t * 9)).toFixed(4)})`)
      }
      g.fillStyle = gr
      g.fillRect(0, 0, 256, 256)
      return c
    }
    const lights = [glow(ACCENT), ...LANE_COLORS.map(glow)]
    const light = (x: number, y: number, r: number, a: number, k = 0) => {
      if (a < 0.005) return
      ctx.globalAlpha = a
      ctx.drawImage(lights[k], x - r, y - r, r * 2, r * 2)
      ctx.globalAlpha = 1
    }
    const label = (text: string, x: number, y: number, a: number, color = MUTED, size = 13, align: CanvasTextAlign = 'left') => {
      if (a <= 0.01) return
      ctx.font = `${Math.max(size, 11 / scale)}px "Geist Variable", Geist, sans-serif`
      ctx.textAlign = align
      ctx.fillStyle = `rgba(${color},${a})`
      ctx.fillText(text, x, y)
    }
    const trace = (from: number, to: number, pt: (t: number) => { x: number; y: number }, steps: number) => {
      ctx.beginPath()
      for (let j = 0; j <= steps; j++) {
        const q = pt(mix(from, to, j / steps))
        if (j) ctx.lineTo(q.x, q.y)
        else ctx.moveTo(q.x, q.y)
      }
    }

    // ---- Sizing ----
    const measure = () => {
      W = canvas.clientWidth
      H = canvas.clientHeight
      const dpr = Math.min(devicePixelRatio, 2)
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      scale = Math.min(W / 1440, H / 780)
      ox = (W - 1440 * scale) / 2
      oy = (H - 900 * scale) / 2
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(canvas)

    // ---- Scroll ----
    const HOLD = 0.5
    let progress = 0
    let target = 0
    let velocity = 0
    let tween: { from: number; to: number; start: number } | null = null
    // While the scene is on screen the page may not run ahead of it: scrolling
    // is held to just past what has been drawn, in either direction, so the
    // story always plays through at its own pace. A big jump (a nav link) passes.
    let lastY = scrollY
    const read = () => {
      const r = section.getBoundingClientRect()
      const travel = Math.max(1, section.offsetHeight - stage.offsetHeight * (1 + HOLD))
      const pin = parseFloat(getComputedStyle(stage).top) || 0
      const raw = (pin - r.top) / travel
      const jump = Math.abs(scrollY - lastY) > innerHeight * 2.5
      lastY = scrollY
      if (!reduce && !tween && !jump && !navigating() && raw > -0.25 && raw < END_AT + 0.6) {
        let held = raw
        if (raw > progress + LEAD && progress < END_AT - 0.002) held = progress + LEAD
        else if (raw < progress - LEAD && progress > 0.002) held = progress - LEAD
        if (held !== raw) {
          const y = scrollY + (held - raw) * travel
          jumpScroll(y)
          lastY = y
          target = clamp(held, 0, END_AT)
          return
        }
      }
      if (jump) {
        // Jumped across the section: skip ahead without drawing every frame.
        progress = clamp(raw, 0, END_AT)
        velocity = 0
      }
      target = clamp(raw, 0, END_AT)
    }
    const titles = [...stage.querySelectorAll<HTMLElement>('.l2-title')]
    const buttons = [...stage.querySelectorAll<HTMLButtonElement>('[data-step]')]
    const key = stage.querySelector<HTMLElement>('.l2-key')!
    const ending = stage.querySelector<HTMLElement>('.l2-end')!
    buttons.forEach((b, i) =>
      b.addEventListener('click', () => {
        const travel = Math.max(1, section.offsetHeight - stage.offsetHeight * (1 + HOLD))
        const pin = parseFloat(getComputedStyle(stage).top) || 0
        tween = { from: progress, to: STOPS[i], start: performance.now() }
        jumpScroll(scrollY + section.getBoundingClientRect().top - pin + travel * STOPS[i])
      }),
    )
    const hover = { x: -1, y: -1 }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      par.tx = e.clientX / innerWidth - 0.5
      par.ty = e.clientY / innerHeight - 0.5
      const r = canvas.getBoundingClientRect()
      hover.x = e.clientX - r.left
      hover.y = e.clientY - r.top
      lens.tx = hover.x
      lens.ty = hover.y
      if (lens.want === 0) {
        lens.x = lens.tx
        lens.y = lens.ty
      }
      lens.want = reduce ? 0 : 1
    }
    const onLeave = () => {
      hover.x = hover.y = -1
      lens.want = 0
    }
    canvas.addEventListener('pointerleave', onLeave)
    // Where each bead was drawn last frame, in canvas pixels, for hover.
    const seen = new Float32Array(beads.length * 2)
    const tip = stage.querySelector<HTMLElement>('.l2-tip')!
    addEventListener('pointermove', onMove, { passive: true })
    addEventListener('scroll', read, { passive: true })
    addEventListener('wheel', () => (tween = null), { passive: true })
    // On load, start wherever the page already is; never pull it back.
    {
      const travel = Math.max(1, section.offsetHeight - stage.offsetHeight * (1 + HOLD))
      const pin = parseFloat(getComputedStyle(stage).top) || 0
      progress = target = clamp((pin - section.getBoundingClientRect().top) / travel, 0, END_AT)
    }

    // ---- Draw ----
    let arrivedAt = 0
    let raf = 0
    let pick = -1
    let pickAt = 0
    let shown = -1
    let level = 0
    let drawnAt = performance.now()
    let settleAll = 0
    let last = performance.now()
    let near = false
    const io = new IntersectionObserver((es) => (near = es[es.length - 1].isIntersecting), { rootMargin: '50% 0px' })
    io.observe(section)

    const draw = (now: number) => {
      const p = sceneAt(Math.min(1, progress))
      const chapter = chapterAt(progress)
      const cover = reduce ? 0 : coverAt(progress)
      titles.forEach((t, i) => {
        t.style.opacity = i === chapter ? cover.toFixed(3) : '0'
        t.style.transform = `translateY(${(i === chapter ? mix(16, -16, span(progress, [0, 0.265, 0.645][i], [0.1, 0.37, 0.75][i])) : 0).toFixed(1)}px)`
      })
      buttons.forEach((b, i) => b.setAttribute('aria-current', String(i === chapter)))
      key.style.opacity = String(p > 0.26 && p < 0.6 && cover < 0.1 ? 1 : 0)
      ending.style.opacity = smoother(span(progress, 0.96, 1.04)).toFixed(3)
      stage.style.setProperty('--intro', String(1 - smoother(span(progress, 0.0, 0.035))))

      back = reduce ? 0 : smoother(span(progress, 0.975, 1.05))
      lift = reduce ? 0 : 1 - smoother(span(progress, 0, 0.045))
      aim(p)
      ctx.clearRect(0, 0, W, H)
      ctx.save()
      ctx.translate(ox, oy)
      ctx.scale(scale, scale)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const arrive = reduce ? 4000 : arrivedAt ? now - arrivedAt : 0

      // Connect: threads draw in from each source and meet at Domino.
      const built = Math.max(1 - smooth(span(p, 0.15, 0.25)), back)
      if (built > 0.003) {
        for (const th of threads) {
          const drawn = out(clamp((arrive - 300 - th.si * 150 - th.delay) / 1100))
          if (drawn <= 0) continue
          const near2 = 1 - th.c / 2
          ctx.lineWidth = mix(0.5, 0.95, near2) / Math.max(scale, 0.6)
          const a = threadPoint(th, 0)
          const ax = a.x
          const ay = a.y
          const b = threadPoint(th, 1)
          const g = ctx.createLinearGradient(ax, ay, b.x, b.y)
          const ink = th.alpha * built * mix(0.45, 1, near2)
          g.addColorStop(0, `rgba(${INK},${ink * 0.35})`)
          g.addColorStop(0.5, `rgba(${INK},${ink})`)
          g.addColorStop(1, `rgba(${INK},${ink * 0.5})`)
          trace(0, drawn, (t) => ({ ...threadPoint(th, t) }), 60)
          ctx.strokeStyle = g
          ctx.stroke()
        }
        // Pulses travel down the front threads, then down the trunk.
        // At the end the verdict runs back out to every system, in orange.
        if (back > 0.6) {
          const clock = ((now / 1000) % 2.4) / 2.4
          sources.forEach((_, si) => {
            const th = threads.find((t) => t.si === si && t.c === 0)!
            const q = { ...threadPoint(th, 1 - sine(clock)) }
            light(q.x, q.y, 14 / scale, 0.9 * (back - 0.6) * 2.5 * (1 - clock))
          })
        }
        const sending = reduce ? 0 : 1 - smooth(span(p, 0.06, 0.14))
        if (sending > 0.001 && arrive > 1400) {
          const clock = (arrive - 1400) % 6000
          sources.forEach((_, si) => {
            const list = threads.filter((th) => th.si === si && th.c === 0)
            list.forEach((th, row) => {
              const launch = (700 * row) / Math.max(1, list.length - 1)
              const t = 0.5 * sine(clamp((clock - launch) / (1500 - launch)))
              if (clock > launch && clock < 1500) {
                const q = { ...threadPoint(th, t) }
                light(q.x, q.y, 10 / scale, 0.7 * sending * built)
              }
            })
            const trunk = clamp((clock - 1500) / 850)
            if (trunk > 0 && trunk < 1) {
              const q = { ...threadPoint(list[0], 0.5 + 0.5 * trunk * trunk) }
              light(q.x, q.y, 18 / scale, 0.9 * sending * built)
            }
          })
        }
        for (const th of threads) {
          if (arrive < 100 + th.si * 150 + th.delay * 0.6) continue
          const q = threadPoint(th, 0)
          const near2 = 1 - th.c / 2
          const r = mix(1.1, 2, near2) * clamp(Math.pow(q.k, 0.8), 0.6, 1.6)
          ctx.fillStyle = `rgba(${INK},${mix(0.25, 0.9, near2) * built})`
          ctx.beginPath()
          ctx.roundRect(q.x - r, q.y - r, r * 2, r * 2, r * 0.6)
          ctx.fill()
        }
        sources.forEach((src, si) => {
          const q = { ...project(START, src.y + ((src.rows - 1) * PY) / 2 + 30, src.depth - PZ) }
          label(src.name, q.x - 2, q.y - 14, clamp((arrive - 100 - si * 150) / 600) * (1 - smooth(span(p, 0.09, 0.16))), INK, 15)
        })
      }
      // The node everything meets at.
      const node = { ...project(0, 0, 0) }
      const nodeOn = Math.max(built, 1 - smooth(span(p, 0.42, 0.48)), back)
      if (back > 0.5) light(node.x, node.y, 40 / scale, 0.5 * back)
      if (nodeOn > 0.01) {
        light(node.x, node.y, 34 / scale, 0.6 * nodeOn)
        ctx.fillStyle = `rgba(${INK},${nodeOn})`
        const ns = 4.5 / Math.max(scale, 0.6)
        ctx.beginPath()
        ctx.roundRect(node.x - ns, node.y - ns, ns * 2, ns * 2, ns * 0.35)
        ctx.fill()
        label(back > 0.5 ? 'Domino, with a verdict' : 'Domino', node.x + 14, node.y + 4, Math.max(nodeOn * (1 - smooth(span(p, 0.2, 0.26))), back), INK, 14)
      }

      // Test: beads burst from the node into a cloud per case, then line up in rows.
      const expand = smoother(span(p, 0.22, 0.42))
      settleAll = smoother(span(p, 0.4, 0.45))
      const grid = smoother(span(p, 0.46, 0.59))
      const gather = smoother(span(p, 0.61, 0.79))
      const beadsOn = expand * (1 - smooth(span(p, 0.86, 0.95)))
      // In the rows, the band under the pointer stays lit and the others dim.
      const rowsOn = grid * (1 - gather)
      let focus = -1
      if (rowsOn > 0.8 && hover.x >= 0) {
        lanes.forEach((_, li) => {
          const a = { ...project(ROW_X0, laneY(li), 0) }
          const b = project(TODAY, laneY(li) - 44, 0)
          const top = Math.min(a.y, b.y) * scale + oy - 14
          const bottom = Math.max(a.y, b.y) * scale + oy + 14
          if (hover.y > top && hover.y < bottom) focus = li
        })
      }
      if (beadsOn > 0.003) {
        for (let i = 0; i < beads.length; i++) {
          const b = beads[i]
          const lane = b.lane
          // Each bead wanders a little on its own slow path while it is loose.
          const [f1, f2, p1, p2] = b.wander
          const loose = (1 - grid) * (reduce ? 0 : 1)
          const drift = (Math.sin(life * f1 + p1) * 18 + Math.sin(life * f2 * 1.7 + p2) * 8) * loose
          const driftZ = Math.cos(life * f2 + p1) * 16 * loose
          // loose spread, then the cloud for its case
          const settle = smoother(clamp(span(p, 0.31, 0.43) * 1.2 - (i % 13) / 60))
          let x = mix(b.spread[0], b.cloud[0], settle) + drift
          let y = mix(b.spread[1], b.cloud[1], settle) + (Math.cos(life * f1 * 1.3 + p2) * 12 + Math.sin(life * f2 + p1) * 6) * loose
          let z = mix(b.spread[2], b.cloud[2], settle) + driftZ
          // rows: one band per case, three rows each, laid along the timeline
          const rx = b.x
          const ry = laneY(lane) - b.row * 22
          // the rows form as a wave, earliest rows first
          const g = smoother(clamp(grid * 1.7 - ((b.x - ROW_X0) / (TODAY - ROW_X0)) * 0.7))
          x = mix(x, rx, g)
          y = mix(y, ry, g)
          z = mix(z, 0, g)
          // gather onto the history line
          x = mix(x, rx, gather)
          y = mix(y, history(), gather)
          // burst: from the node outward
          const e = smoother(clamp(expand * 1.25 - (i % 17) / 70))
          x = mix(0, x, e)
          y = mix(0, y, e)
          z = mix(0, z, e)
          const q = project(x, y, z)
          if (q.k > 5) continue
          // Color arrives as each bead finds its case.
          const own = b.hot ? (data.failed ? FAIL : ACCENT) : LANE_COLORS[lane % LANE_COLORS.length]
          const color = settle > 0.98 ? own : tint(b.ember, own, settle)
          // Each bead twinkles on its own clock while it is loose.
          const pulse = reduce ? 1 : mix(0.5 + 0.5 * Math.sin(life * b.rate + b.phase), 1, grid)
          const a = beadsOn * (b.hot ? 1 : 0.9) * (1 - gather * 0.6) * mix(0.55, 1, pulse)
          const r = (b.hot ? 2.2 : 1.8) * mix(b.size, 1, grid) * clamp(q.k, 0.6, 2.2) * mix(1, 0.75, grid)
          // A soft halo that breathes with the twinkle: orange while loose, the case color once settled.
          if (grid < 0.6) {
            const halo = (b.hot ? 18 : 14) * mix(0.9, 1.25, pulse) * clamp(q.k, 0.6, 2.2) * b.size
            light(q.x, q.y, halo / scale, 0.55 * a * (1 - grid) * mix(0.4, 1, pulse), settle > 0.6 && !b.hot ? 1 + (lane % LANE_COLORS.length) : 0)
          }
          ctx.fillStyle = `rgba(${color},${a.toFixed(3)})`
          ctx.beginPath()
          ctx.arc(q.x, q.y, r, 0, TAU)
          ctx.fill()
          seen[i * 2] = q.x * scale + ox
          seen[i * 2 + 1] = q.y * scale + oy
        }
        // Case labels and the axis, once the beads are in rows.
        if (rowsOn > 0.01) {
          lanes.forEach((lane, li) => {
            const q = { ...project(ROW_X0 - 40, laneY(li) - 22, 0) }
            const lit = mix(0.55, 1, focus === li ? 1 : shown >= 0 && beads[shown].lane === li ? smooth(level) : 0)
            label(lane.name, q.x, q.y + 4, smooth(span(rowsOn, 0.65, 1)) * lit, INK, 13, 'right')
          })
          const a = { ...project(ROW_X0, laneY(0) + 40, 0) }
          const z = { ...project(TODAY, laneY(0) + 40, 0) }
          const axis = smooth(span(rowsOn, 0.65, 1)) * 0.8
          label('Records before the change · one line per run', a.x, a.y, axis, MUTED, 11)
          label('Added by the change', z.x, z.y, axis, FAIL, 11, 'right')
        }
      }
      // One bead at a time is lit with its card: the one under the pointer, or, when
      // the scene is still, one picked every few seconds. Changes cross-fade.
      const dtd = Math.min(0.05, (now - drawnAt) / 1000)
      drawnAt = now
      let hit = -1
      if (beadsOn > 0.5 && gather < 0.2 && hover.x >= 0) {
        let best = 64
        for (let i = 0; i < beads.length; i++) {
          const dx = seen[i * 2] - hover.x
          const dy = seen[i * 2 + 1] - hover.y
          const d = dx * dx + dy * dy
          if (d < best) {
            best = d
            hit = i
          }
        }
      }
      const still = beadsOn > 0.9 && gather < 0.05 && ((settleAll > 0.98 && grid < 0.02) || grid > 0.995) && Math.abs(velocity) < 0.03 && !tween
      let want = hit
      if (want < 0 && still) {
        if (pick < 0 || now - pickAt > 3400) {
          pickAt = now
          // a bead near the middle of the frame, so its card stays on screen
          for (let tries = 0; tries < 40; tries++) {
            const j = Math.floor(Math.random() * beads.length)
            const x = seen[j * 2]
            const y = seen[j * 2 + 1]
            if (j !== pick && x > W * 0.22 && x < W * 0.72 && y > H * 0.25 && y < H * 0.72) {
              pick = j
              break
            }
          }
        }
        want = pick
      } else if (hit >= 0 || !still) pick = -1
      const rate = hit >= 0 ? 14 : 3
      if (want !== shown) {
        level = Math.max(0, level - dtd * rate)
        if (level === 0) {
          shown = want
          if (shown >= 0) {
            const b = beads[shown]
            const c = b.hot ? FAIL : LANE_COLORS[b.lane % LANE_COLORS.length]
            tip.innerHTML = `<b>Row ${b.n} of ${b.of} · run ${b.run} of ${b.runs}</b><span><i style="background:rgb(${c})"></i>${lanes[b.lane].name} · ${b.hot ? 'added by the change' : 'there before the change'}</span>`
          }
        }
      } else if (shown >= 0) level = Math.min(1, level + dtd * rate)
      if (shown >= 0 && level > 0.001) {
        const b = beads[shown]
        const e = smooth(level)
        const c = b.hot ? FAIL : LANE_COLORS[b.lane % LANE_COLORS.length]
        ctx.save()
        ctx.translate(ox, oy)
        ctx.scale(scale, scale)
        const hx = (seen[shown * 2] - ox) / scale
        const hy = (seen[shown * 2 + 1] - oy) / scale
        light(hx, hy, mix(10, 28, e) / scale, 0.7 * e, b.hot ? 0 : 1 + (b.lane % LANE_COLORS.length))
        ctx.fillStyle = `rgba(${c},${e.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(hx, hy, mix(2, 4, e) / scale, 0, TAU)
        ctx.fill()
        ctx.restore()
        tip.style.transform = `translate(${(seen[shown * 2] + 14).toFixed(1)}px, ${(seen[shown * 2 + 1] - 18 + (1 - e) * 5).toFixed(1)}px)`
        tip.style.opacity = e.toFixed(3)
      } else if (tip.style.opacity !== '0') tip.style.opacity = '0'
      canvas.style.cursor = hit >= 0 ? 'pointer' : ''

      // Decide: the timeline, the fork at the change, and the limit.
      const ink = smoother(span(p, 0.73, 0.81)) * (1 - back)
      if (ink > 0.001) {
        const head = headAt(p)
        ctx.strokeStyle = `rgba(${INK},${0.7 * ink})`
        ctx.lineWidth = 2 / scale
        trace(0, Math.min(TODAY, head), (x) => ({ ...project(x, history(), 0) }), 60)
        ctx.stroke()
        const fork = { ...project(TODAY, 0, 0) }
        if (head > TODAY) {
          // limit
          if (lim != null) {
            ctx.setLineDash([6 / scale, 6 / scale])
            ctx.strokeStyle = `rgba(${FAIL},${0.7 * ink})`
            ctx.lineWidth = 1.2 / scale
            trace(TODAY - 600, END + 80, (x) => ({ ...project(x, Y(lim), 0) }), 2)
            ctx.stroke()
            ctx.setLineDash([])
            const lq = { ...project(TODAY - 600, Y(lim), 0) }
            label(`limit ${lim}`, lq.x - 10, lq.y + 4, ink, FAIL, 13, 'right')
          }
          // control: flat
          ctx.strokeStyle = `rgba(${MUTED},${0.8 * ink})`
          ctx.lineWidth = 1.8 / scale
          trace(TODAY, head, (x) => ({ ...project(x, control(), 0) }), 40)
          ctx.stroke()
          // candidate: a glowing foil that turns red past the limit
          for (let c = 0; c < 48; c++) {
            const a0 = mix(TODAY, head, c / 48)
            const a1 = mix(TODAY, head, (c + 1) / 48)
            const v = base + (candidate(a1) / 340) * (topV - base)
            const over = lim != null && v > lim
            ctx.strokeStyle = `rgba(${over ? FAIL : ACCENT},${ink})`
            ctx.lineWidth = mix(2.2, 3.4, el(a0)) / scale
            trace(a0, a1, (x) => ({ ...project(x, candidate(x), 0) }), 4)
            ctx.stroke()
          }
          for (let j = 1; j <= 7; j++) {
            const x = mix(TODAY, head, j / 7)
            const q = { ...project(x, candidate(x), 0) }
            light(q.x, q.y, mix(40, 110, el(x)) / scale, 0.12 * ink, 0)
          }
          const tip = { ...project(head, candidate(head), 0) }
          light(tip.x, tip.y, 26 / scale, 0.8 * ink, 0)
          light(tip.x, tip.y, 70 / scale, 0.35 * ink, 0)
          // The gap between control and candidate, bracketed at the end.
          const gap = smooth(span(p, 0.95, 1)) * ink
          if (gap > 0.01) {
            const cb = { ...project(head, control(), 0) }
            ctx.strokeStyle = `rgba(${INK},${0.35 * gap})`
            ctx.lineWidth = 1 / scale
            ctx.beginPath()
            ctx.moveTo(tip.x + 40, tip.y)
            ctx.lineTo(tip.x + 40, cb.y)
            ctx.moveTo(tip.x + 34, tip.y)
            ctx.lineTo(tip.x + 46, tip.y)
            ctx.moveTo(tip.x + 34, cb.y)
            ctx.lineTo(tip.x + 46, cb.y)
            ctx.stroke()
            label(`+${cand - base}`, tip.x + 52, (tip.y + cb.y) / 2 + 4, gap, INK, 12)
          }
          ctx.fillStyle = `rgba(${data.failed ? FAIL : ACCENT},${ink})`
          ctx.beginPath()
          ctx.arc(tip.x, tip.y, 4 / scale, 0, TAU)
          ctx.fill()
          const done = smooth(span(p, 0.93, 1))
          const cq = { ...project(head, control(), 0) }
          label(`change undone: ${base}`, cq.x + 12, cq.y + 22, done * ink, INK, 13)
          label(`with the change: ${cand}${data.failed ? ' · broke' : ''}`, tip.x - 12, tip.y - 16, done * ink, data.failed ? FAIL : ACCENT, 14, 'right')
        }
        ctx.fillStyle = `rgba(${INK},${ink})`
        ctx.beginPath()
        ctx.arc(fork.x, fork.y, 3.5 / scale, 0, TAU)
        ctx.fill()
        label('the change', fork.x, fork.y + 26, ink, MUTED, 12, 'center')
        const hq = { ...project(TODAY * 0.5, 0, 0) }
        label(`before the change: ${base}`, hq.x, hq.y - 14, ink * (1 - smooth(span(p, 0.95, 1))), INK, 13, 'center')
        if (data.measure) {
          const mq = { ...project(0, 0, 0) }
          label(data.measure, mq.x, mq.y + 40, ink * 0.8, MUTED, 12)
        }
      }
      ctx.restore()
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!near) {
        last = now
        return
      }
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      life += dt
      if (!arrivedAt && progress < 0.2 && section.getBoundingClientRect().top < innerHeight * 0.5) arrivedAt = now
      if (tween) {
        const k = clamp((now - tween.start) / 2600)
        progress = mix(tween.from, tween.to, smoother(k))
        if (k >= 1) tween = null
      } else {
        // Ease toward the scroll position, like a damped spring.
        // A steady follower with a speed cap: however fast the page scrolls, the
        // scene moves at most MAX_SPEED of its length per second, easing only
        // over the last bit, so every frame of it is drawn.
        const gap = target - progress
        const speed = Math.min(MAX_SPEED, Math.abs(gap) * 12 + 0.02)
        const moved = Math.sign(gap) * Math.min(Math.abs(gap), speed * dt)
        progress += moved
        velocity = dt > 0 ? moved / dt : 0
        if (reduce) progress = target
      }
      lens.x += (lens.tx - lens.x) * Math.min(1, dt * 9)
      lens.y += (lens.ty - lens.y) * Math.min(1, dt * 9)
      lens.on += (lens.want - lens.on) * Math.min(1, dt * 4)
      par.x += (par.tx - par.x) * Math.min(1, dt * 3)
      par.y += (par.ty - par.y) * Math.min(1, dt * 3)
      draw(now)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      removeEventListener('pointermove', onMove)
      removeEventListener('scroll', read)
      canvas.removeEventListener('pointerleave', onLeave)
    }
  }, [data])

  return (
    <section ref={sectionRef} id="loop" className="l2" aria-labelledby="l2-title">
      <div ref={stageRef} className="l2-stage">
        <header className="g-wrap l2-head" style={{ opacity: 'var(--intro, 1)' } as React.CSSProperties}>
          <p className="g-label" style={{ marginBottom: 18 }}>
            The loop
          </p>
          <h2 id="l2-title" className="g-h2">
            One change.
            <br />
            Your whole pipeline.
          </h2>
          <p className="g-body">Watch one change move through every part of an app, and see where it breaks.</p>
        </header>
        <canvas ref={canvasRef} className="l2-canvas" role="img" aria-label="Animation: source systems join into Domino, measured rows from each case are tested in a sandbox, and the candidate run climbs past its limit while the control stays flat." />
        <div className="l2-titles" aria-hidden="true">
          {CHAPTERS.map((c) => (
            <div key={c.key} className="l2-title">
              <h3>{c.title}</h3>
              <p>{c.sub}</p>
            </div>
          ))}
        </div>
        <p className="l2-key" aria-hidden="true">
          {cards.slice(0, 5).map((c, i) => (
            <span key={c.id}>
              <i style={{ background: `rgb(${LANE_COLORS[i % LANE_COLORS.length]})` }} />
              {c.label}
            </span>
          ))}
        </p>
        <div className="l2-tip" aria-hidden="true" />
        <div className="l2-end" aria-hidden="true">
          <p>The answer goes into a report for the pull request.</p>
          <span>The next change begins.</span>
        </div>
        <footer className="l2-foot">
          <nav aria-label="Story stages">
            {CHAPTERS.map((c, i) => (
              <button key={c.key} type="button" data-step={i}>
                {c.key}
              </button>
            ))}
          </nav>
          <a href={href.cases}>
            <i className="l2-lens" aria-hidden="true" />
            Open the dashboard <span aria-hidden="true">↗</span>
          </a>
        </footer>
      </div>
    </section>
  )
}

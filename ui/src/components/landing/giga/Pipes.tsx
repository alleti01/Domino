// Behind the closing call to action: pipelines running across the section.
// Each is a smooth line through a few stages (small squares); orange pulses
// course along them, and now and then a stage flashes red as a pulse hits it,
// the way one change breaks something downstream. It fades out around the
// centre so the words stay clear, and only runs while on screen.

import { useEffect, useRef } from 'react'

const ACCENT = '240,138,50'
const FAIL = '229,72,77'
const INK = '31,29,27'

interface Pipe {
  pts: [number, number][]
  stages: number[]
  pulses: { t: number; speed: number; tail: number }[]
  flash: number[]
}

/** Seeded random, so the layout is the same on every visit. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

function makePipes(): Pipe[] {
  const r = rng(91)
  const pipes: Pipe[] = []
  // Bands above and below the words, and lanes down each side.
  const bands = [0.08, 0.16, 0.25, 0.76, 0.86, 0.94]
  for (const y0 of bands) {
    const pts: [number, number][] = []
    const n = 7
    for (let i = 0; i < n; i++) {
      const x = -0.05 + (1.1 * i) / (n - 1)
      pts.push([x, y0 + (r() - 0.5) * 0.08])
    }
    pipes.push(make(pts, r))
  }
  for (const x0 of [0.05, 0.13, 0.87, 0.95]) {
    const pts: [number, number][] = []
    const n = 6
    for (let i = 0; i < n; i++) pts.push([x0 + (r() - 0.5) * 0.06, -0.05 + (1.1 * i) / (n - 1)])
    pipes.push(make(pts, r))
  }
  return pipes
}

function make(pts: [number, number][], r: () => number): Pipe {
  const stages = pts.slice(1, -1).map((_, i) => i + 1)
  const count = 1 + Math.round(r())
  return {
    pts,
    stages,
    pulses: Array.from({ length: count }, () => ({ t: r(), speed: 0.045 + r() * 0.05, tail: 0.05 + r() * 0.04 })),
    flash: stages.map(() => 0),
  }
}

/** A point along a Catmull-Rom curve through the pipe's points, t in [0, 1]. */
function at(p: [number, number][], t: number): [number, number] {
  const seg = p.length - 1
  const f = Math.min(seg - 1e-6, Math.max(0, t * seg))
  const i = Math.floor(f)
  const u = f - i
  const a = p[Math.max(0, i - 1)]
  const b = p[i]
  const c = p[i + 1]
  const d = p[Math.min(seg, i + 2)]
  const u2 = u * u
  const u3 = u2 * u
  const k = (j: 0 | 1) => 0.5 * (2 * b[j] + (-a[j] + c[j]) * u + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * u2 + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * u3)
  return [k(0), k(1)]
}

export function Pipes({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    // On the orange panel: cream lines and pulses, and a dark flash for a break.
    const light = tone === 'light'
    const LINE = light ? '255,250,242' : INK
    const PULSE = light ? '255,253,248' : ACCENT
    const BREAK = light ? '74,26,4' : FAIL
    const ctx = canvas.getContext('2d')!
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const pipes = makePipes()
    let W = 0
    let H = 0
    const size = () => {
      const dpr = Math.min(devicePixelRatio, 2)
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    size()
    const ro = new ResizeObserver(size)
    ro.observe(canvas)

    let visible = false
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    io.observe(canvas)
    const rand = rng(7)

    const draw = (dt: number) => {
      ctx.clearRect(0, 0, W, H)
      const px = (p: [number, number]): [number, number] => [p[0] * W, p[1] * H]
      for (const pipe of pipes) {
        // the pipe itself
        ctx.beginPath()
        for (let s = 0; s <= 80; s++) {
          const [x, y] = px(at(pipe.pts, s / 80))
          if (s) ctx.lineTo(x, y)
          else ctx.moveTo(x, y)
        }
        ctx.strokeStyle = `rgba(${LINE},${light ? 0.32 : 0.09})`
        ctx.lineWidth = 1
        ctx.stroke()

        // pulses
        for (const pulse of pipe.pulses) {
          const before = pulse.t
          pulse.t += pulse.speed * dt
          if (pulse.t > 1 + pulse.tail) pulse.t = -pulse.tail
          // a stage it just passed may flash red
          pipe.stages.forEach((si, k) => {
            const ts = si / (pipe.pts.length - 1)
            if (before < ts && pulse.t >= ts) pipe.flash[k] = rand() < 0.14 ? 1 : 0.35
          })
          const steps = 14
          for (let s = 0; s < steps; s++) {
            const t = pulse.t - (pulse.tail * s) / steps
            if (t < 0 || t > 1) continue
            const [x, y] = px(at(pipe.pts, t))
            const a = (1 - s / steps) * 0.9
            ctx.fillStyle = `rgba(${PULSE},${(a * (light ? 0.9 : 0.55)).toFixed(3)})`
            ctx.beginPath()
            ctx.arc(x, y, s === 0 ? 2.6 : 1.6 * (1 - s / steps) + 0.6, 0, Math.PI * 2)
            ctx.fill()
          }
          if (pulse.t >= 0 && pulse.t <= 1) {
            const [x, y] = px(at(pipe.pts, pulse.t))
            const g = ctx.createRadialGradient(x, y, 0, x, y, 14)
            g.addColorStop(0, `rgba(${PULSE},${light ? 0.55 : 0.35})`)
            g.addColorStop(1, `rgba(${PULSE},0)`)
            ctx.fillStyle = g
            ctx.fillRect(x - 14, y - 14, 28, 28)
          }
        }

        // stages
        pipe.stages.forEach((si, k) => {
          const [x, y] = px(pipe.pts[si])
          const f = pipe.flash[k]
          const red = f > 0.5
          pipe.flash[k] = Math.max(0, f - dt * (red ? 0.8 : 1.6))
          const s = 3.2
          ctx.fillStyle = red ? `rgba(${BREAK},${(0.4 + 0.6 * f).toFixed(3)})` : `rgba(${f > 0.01 ? PULSE : LINE},${((light ? 0.4 : 0.16) + 0.6 * f).toFixed(3)})`
          ctx.fillRect(x - s, y - s, s * 2, s * 2)
          if (red) {
            ctx.strokeStyle = `rgba(${BREAK},${(0.5 * f).toFixed(3)})`
            ctx.lineWidth = 1
            ctx.strokeRect(x - s - 4 * (1 - f) - 2, y - s - 4 * (1 - f) - 2, (s + 4 * (1 - f) + 2) * 2, (s + 4 * (1 - f) + 2) * 2)
          }
        })
      }
    }

    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (visible) draw(reduce ? 0 : dt)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
    }
  }, [tone])

  return <canvas ref={ref} className="g-pipes" aria-hidden="true" />
}

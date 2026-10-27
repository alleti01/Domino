// The hero: copy over a 1440 × 900 frame (scaled to the window), and a physical
// device built from layered materials: a glass screen on the left, a grained
// plate on the right with engraved seams, a recessed dial with a lit ring, two
// keys with ring LEDs, screws and a speaker grille. On load it is drawn as a
// blueprint first, then each part switches on.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { HEADLINE, HERO_SUB } from '../../../content'
import { href } from '../../../lib/router'
import type { CaseCard } from './data'

// A fine monochrome noise tile, generated once, for the plate's grain.
function grainTile() {
  const c = document.createElement('canvas')
  c.width = c.height = 120
  const g = c.getContext('2d')!
  const img = g.createImageData(120, 120)
  let seed = 7
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647
    const v = seed % 255
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 18
  }
  g.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}

// Power-on, in seconds after load, in giga's order: the background comes in on its
// own (the gradient, then its bands), then the words, then the device is drawn as
// a blueprint, its plate fills, the screen and the dial land, the screen content
// fades up and types, and the whole device warms to full brightness like a lamp.
const ON = {
  bands: 0,
  stripes: 0.3,
  text: 0.62,
  sub: 0.72,
  outline: 0.8,
  outlineDur: 0.65,
  plate: 1.4,
  seams: 1.45,
  screws: 1.5,
  keys: 1.55,
  screen: 1.6,
  cap: 1.62,
  content: 1.85,
  type: 1.95,
  lamps: 2.3,
  warm: 3.6,
  done: 3.8,
}
const FADE: Partial<Record<keyof typeof ON, number>> = { text: 0.45, sub: 0.45 }

export function Hero({ cards }: { cards: CaseCard[] }) {
  const [pick, setPick] = useState(0)
  const [typed, setTyped] = useState('')
  const [mode, setMode] = useState<'cases' | 'evidence'>('cases')
  const [pressed, setPressed] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const hero = useRef<HTMLElement>(null)
  const grain = useMemo(() => (typeof document === 'undefined' ? '' : grainTile()), [])
  const c = cards[pick] ?? null
  const prompt = 'try a recorded change'

  // Scale the 1440 × 900 composition to the window, like a print layout.
  useEffect(() => {
    const fit = () => {
      const W = innerWidth
      const s = W < 1024 ? Math.min(W - 32, 860) / 1100 : Math.min(1, W / 1440)
      frame.current?.style.setProperty('--s', s.toFixed(5))
      hero.current?.style.setProperty('--hh', `${(900 * s).toFixed(1)}px`)
    }
    fit()
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [])

  // Lights down: as the hero scrolls away the room dims and only the lamps stay
  // lit. --dark runs 0 → 1 on an S-curve; the materials read it.
  useEffect(() => {
    const el = hero.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let night = false
    const read = () => {
      raf = 0
      // Desktop: the composition's first 800 px. Phones: the last part of the hero.
      const s = Number(frame.current?.style.getPropertyValue('--s') || 1)
      const narrow = innerWidth < 1024
      const start = narrow ? el.offsetHeight * 0.6 : 60 * s
      const span = narrow ? el.offsetHeight * 0.4 : 740 * s
      const t = Math.min(1, Math.max(0, (scrollY - start) / span))
      const dark = t * t * (3 - 2 * t)
      el.style.setProperty('--dark', dark.toFixed(4))
      if (dark > 0.6 !== night) el.classList.toggle('is-night', (night = dark > 0.6))
    }
    const on = () => (raf ||= requestAnimationFrame(read))
    read()
    addEventListener('scroll', on, { passive: true })
    return () => {
      removeEventListener('scroll', on)
      cancelAnimationFrame(raf)
    }
  }, [])

  // Power-on: background, words, blueprint, parts, content, typing, warm-up.
  // A layout effect, so the first frame is set before the browser paints.
  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const parts = [...el.querySelectorAll<HTMLElement>('[data-on]')]
    const outline = el.querySelector<SVGElement>('.d-bp')!
    const bands = hero.current?.querySelector<HTMLElement>('.g-bands')
    const stripes = hero.current?.querySelector<HTMLElement>('.g-scan')
    const strokes = [...outline.querySelectorAll<SVGGeometryElement>('[data-draw]')]
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const t = reduce ? 9 : (now - t0) / 1000
      const clamp = (x: number) => Math.min(1, Math.max(0, x))
      strokes.forEach((s) => (s.style.strokeDashoffset = (1000 * (1 - clamp((t - ON.outline) / ON.outlineDur))).toFixed(1)))
      outline.style.opacity = String(1 - clamp((t - ON.cap - 0.1) / 0.3))
      if (bands) bands.style.opacity = t >= ON.done ? '' : String(clamp((t - ON.bands) / 0.45))
      if (stripes) stripes.style.opacity = t >= ON.done ? '' : String(clamp((t - ON.stripes) / 0.4))
      for (const p of parts) {
        const key = p.dataset.on as keyof typeof ON
        const k = clamp((t - (ON[key] ?? 0)) / (FADE[key] ?? 0.16))
        p.style.opacity = t >= ON.done ? '' : k.toFixed(3)
        if (key === 'text' || key === 'sub') p.style.translate = t >= ON.done ? '' : `0 ${((1 - k) * 8).toFixed(1)}px`
      }
      el.style.setProperty('--content', clamp((t - ON.content) / 0.4).toFixed(3))
      el.style.setProperty('--lit', clamp((t - ON.lamps) / 0.4).toFixed(3))
      hero.current?.style.setProperty('--warm', (1 - Math.pow(1 - clamp((t - ON.plate) / (ON.warm - ON.plate)), 3)).toFixed(3))
      if (t < ON.done + 0.4) raf = requestAnimationFrame(step)
    }
    step(t0)
    // Then the prompt types itself.
    let n = 0
    const start = setTimeout(
      () => {
        const id = setInterval(() => {
          n++
          setTyped(prompt.slice(0, n))
          if (n >= prompt.length) clearInterval(id)
        }, 58)
      },
      reduce ? 0 : ON.type * 1000,
    )
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(start)
    }
  }, [])

  // The dial sinks, its ring lights, then the investigation opens.
  const go = () => {
    if (pressed) return
    setPressed(true)
    const to = (c ? href.case(c.id) : href.cases).replace(/^#/, '')
    setTimeout(() => (window.location.hash = to), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 520)
  }

  return (
    <section ref={hero} className="g-hero d-hero" aria-labelledby="hero-title">
      <div className="g-bands" aria-hidden="true" />
      <div className="g-scan" aria-hidden="true" />
      <div ref={frame} className="d-frame" style={{ '--grain': `url(${grain})` } as CSSProperties}>
        <p className="g-label d-kicker" data-on="text">Pre-deployment failure investigation</p>
        <h1 id="hero-title" className="d-title" data-on="text">
          {HEADLINE[0]}
          <br />
          {HEADLINE[1]}
        </h1>
        <p className="d-sub" data-on="sub">{HERO_SUB}</p>

        <div className="d-machine">
          <div className="d-shadow" data-on="plate" aria-hidden="true" />
          {/* Left: the glass screen. */}
          <div className="d-screen" data-on="screen">
            <div className="d-sc-head">
              <span className="d-prompt">
                {typed}
                <span className="d-caret" aria-hidden="true">
                  _
                </span>
              </span>
            </div>
            <div className="d-rule" />
            {mode === 'cases' ? (
              <ul className="d-log" aria-label="Recorded changes">
                {cards.slice(0, 4).map((k, i) => (
                  <li key={k.id}>
                    <button type="button" aria-pressed={i === pick} onClick={() => setPick(i)}>
                      <span>{k.title}</span>
                      <span className="d-log-id">{k.id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <dl className="d-ev">
                <div>
                  <dt>Change</dt>
                  <dd>{c?.title ?? 'None recorded'}</dd>
                </div>
                <div>
                  <dt>{c?.measure ?? 'Measure'}</dt>
                  <dd>
                    {c ? `${c.baseline} → ${c.candidate}` : 'n/a'}
                    {c?.limit != null && <span> · limit {c.limit}</span>}
                  </dd>
                </div>
                <div>
                  <dt>Verdict</dt>
                  <dd className={c?.failed ? 'is-fail' : undefined}>{c?.verdictLabel ?? 'No verdict'}</dd>
                </div>
                <div>
                  <dt>Runs</dt>
                  <dd>{c ? `${c.agreeing} of ${c.runs} agree` : 'n/a'}</dd>
                </div>
              </dl>
            )}
            <div className="d-hello">
              <p>Pick a recorded change. The dial opens its investigation.</p>
              <div className="d-field">
                <span>{c ? `${c.measure.toLowerCase()} · ${c.baseline} → ${c.candidate}` : 'No recorded change'}</span>
                <button type="button" className="d-go" onClick={go}>
                  Investigate
                </button>
              </div>
              <p className="d-fine">Recorded runs on synthetic systems. Nothing is sent anywhere.</p>
            </div>
            <div className="d-glass" />
          </div>

          {/* Right: the plate and its controls. */}
          <div className="d-deck">
            <div className="d-plate" data-on="plate">
              <i className="d-plate-lamp" />
              <i className="d-plate-grain" />
              <i className="d-reflect" />
              <i className="d-one-lamp" />
              <i className="d-plate-edge" />
            </div>
            <i className="d-seam d-seam-h" data-on="seams" />
            <i className="d-seam d-seam-v" data-on="seams" />
            <span className="d-legend-mark" data-on="seams">
              domino
            </span>
            <span className="d-dots" data-on="screws" aria-hidden="true">
              {Array.from({ length: 13 }, (_, i) => (
                <i key={i} />
              ))}
            </span>
            <i className="d-screw d-screw-1" data-on="screws" style={{ ['--rot' as string]: '20deg' }}>
              <i />
            </i>
            <i className="d-screw d-screw-2" data-on="screws" style={{ ['--rot' as string]: '-35deg' }}>
              <i />
            </i>

            <i className="d-led" data-on="lamps" />
            {(
              [
                ['cases', 'Changes', 'd-key-a'],
                ['evidence', 'Evidence', 'd-key-b'],
              ] as const
            ).map(([m, label, cls]) => (
              <button key={m} type="button" className={`d-key ${cls}`} data-on="keys" aria-pressed={mode === m} onClick={() => setMode(m)}>
                <span className="d-key-lbl">
                  <i className={`d-ring${mode === m ? (m === 'evidence' && c?.failed ? ' is-fail' : ' is-on') : ''}`} />
                  {label}
                </span>
              </button>
            ))}

            <button type="button" className="d-talk" data-on="cap" onClick={go} aria-pressed={pressed} aria-label={c ? `Investigate: ${c.title}` : 'Open the dashboard'}>
              <i className="d-halo" />
              <i className="d-cut" />
              <i className="d-cap-sh" />
              <i className="d-cap" />
              <i className="d-mark" />
              <span className="d-cap-lbl">Run</span>
            </button>
          </div>

          {/* The blueprint drawn before the parts switch on. */}
          <svg className="d-bp" viewBox="0 0 1100 470" aria-hidden="true">
            <rect data-draw x=".5" y=".5" width="1099" height="469" rx="12" pathLength={1000} strokeDasharray="1000" />
            <line data-draw x1="550" y1="0" x2="550" y2="470" pathLength={1000} strokeDasharray="1000" />
            <line data-draw x1="550" y1="235" x2="1100" y2="235" pathLength={1000} strokeDasharray="1000" />
            <line data-draw x1="825" y1="235" x2="825" y2="470" pathLength={1000} strokeDasharray="1000" />
            <circle data-draw cx="825" cy="235" r="108" pathLength={1000} strokeDasharray="1000" />
            <circle data-draw cx="825" cy="235" r="98" pathLength={1000} strokeDasharray="1000" />
            <rect data-draw x="38" y="380" width="474" height="54" rx="10" pathLength={1000} strokeDasharray="1000" />
          </svg>
        </div>
      </div>
    </section>
  )
}

// The cases, as an accordion of panels: an intro card, then one panel per
// recorded change. The active panel opens wide, the next one half way, the rest
// fold into strips. Each panel's picture is drawn from its own run: one dot per
// measured row, the rows the change added in red, and a mark at the limit.

import { useEffect, useRef, useState } from 'react'
import { href } from '../../../lib/router'
import type { CaseCard } from './data'
import { Reveal } from './Reveal'

const TONES: [string, string][] = [
  ['#f6e3cf', '#efc9a2'],
  ['#efe9e1', '#ded5c9'],
  ['#f3dcc4', '#e8b98c'],
  ['#ebe5dc', '#d9cfc2'],
  ['#f7e7d6', '#f0cfaa'],
]

const num = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : null)
const short = (label: string) => label.replace(/\s*\([^)]*\)\s*$/, '')

function paint(canvas: HTMLCanvasElement, c: CaseCard, i: number) {
  const W = 500
  const H = 440
  const dpr = Math.min(devicePixelRatio, 2)
  canvas.width = W * dpr
  canvas.height = H * dpr
  const g = canvas.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  const [a, b] = TONES[i % TONES.length]
  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, a)
  bg.addColorStop(1, b)
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  // Light from the top left, like the device plate.
  const lamp = g.createRadialGradient(W * 0.2, -40, 0, W * 0.2, -40, W * 0.9)
  lamp.addColorStop(0, 'rgba(255,255,255,.55)')
  lamp.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = lamp
  g.fillRect(0, 0, W, H)

  // One dot per measured row.
  const base = num(c.baseline) ?? 0
  const cand = num(c.candidate) ?? base
  const total = Math.max(1, Math.min(420, Math.max(base, cand)))
  const added = Math.max(0, Math.min(total, cand) - base)
  const cols = total > 60 ? 20 : total > 12 ? 8 : 4
  const rows = Math.ceil(total / cols)
  const gap = Math.min(total <= 12 ? 52 : 18, (H - 170) / Math.max(rows, 1), (W - 120) / cols)
  const x0 = W - 56 - (cols - 1) * gap
  const y0 = H - 56 - (rows - 1) * gap
  const r = Math.max(1.6, Math.min(gap * 0.28, 14))
  for (let k = 0; k < total; k++) {
    const x = x0 + (k % cols) * gap
    const y = y0 + Math.floor(k / cols) * gap
    const hot = k >= base && k < base + added
    g.fillStyle = hot ? (c.failed ? 'rgba(214,64,58,.9)' : 'rgba(240,138,50,.9)') : 'rgba(31,29,27,.32)'
    g.beginPath()
    g.arc(x, y, hot ? r * 1.1 : r, 0, Math.PI * 2)
    g.fill()
  }
  // The limit, where the row count crosses it.
  if (c.limit != null && c.limit < total) {
    const k = c.limit
    const y = y0 + Math.floor(k / cols) * gap - gap / 2
    g.strokeStyle = 'rgba(214,64,58,.75)'
    g.setLineDash([4, 4])
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(x0 - 18, y)
    g.lineTo(x0 + (cols - 1) * gap + 18, y)
    g.stroke()
    g.setLineDash([])
    g.fillStyle = 'rgba(214,64,58,.9)'
    g.font = '500 11px "Geist Mono Variable", "Geist Mono", monospace'
    g.textAlign = 'right'
    g.fillText(`LIMIT ${c.limit}`, x0 - 24, y + 4)
  }
  // The numbers, large.
  g.textAlign = 'left'
  g.fillStyle = 'rgba(31,29,27,.82)'
  g.font = '400 58px "Geist Pixel Line", "Geist Mono", monospace'
  g.fillText(`${c.baseline}→${c.candidate}`, 36, 86)
  g.fillStyle = 'rgba(31,29,27,.5)'
  g.font = '500 11px "Geist Mono Variable", "Geist Mono", monospace'
  g.fillText(c.measure.toUpperCase(), 38, 112)
}

function Panel({ c, i, state, onPick }: { c: CaseCard; i: number; state: string; onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const draw = () => ref.current && paint(ref.current, c, i)
    draw()
    document.fonts?.ready.then(draw)
  }, [c, i])
  return (
    <button type="button" className="k-panel" data-state={state} onClick={onPick} aria-label={`${c.title}: ${c.verdictLabel}`} aria-pressed={state === 'on'}>
      <canvas ref={ref} aria-hidden="true" />
      <span className="k-panel-label">
        {short(c.label)}
        <small>{c.id}</small>
      </span>
    </button>
  )
}

function Arrow({ left = false }: { left?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d={left ? 'M7.5 2.5 4 6l3.5 3.5' : 'M4.5 2.5 8 6 4.5 9.5'} fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export function Cases({ cards }: { cards: CaseCard[] }) {
  // 0 is the intro card; 1..n are the cases.
  const [at, setAt] = useState(0)
  const last = cards.length
  if (!cards.length) return null
  const c = at > 0 ? cards[at - 1] : null
  const runs = cards.reduce((n, k) => n + k.runs, 0)
  const state = (k: number) => (k === at ? 'on' : k === at + 1 ? 'next' : k === at + 2 ? 'near' : k < at ? 'past' : 'far')

  return (
    <section id="cases" className="g-section k-section" aria-labelledby="cases-title">
      <div className="g-wrap">
        <div className="g-head">
          <Reveal>
            <p className="g-label">Cases</p>
            <h2 id="cases-title" className="g-h2">
              Every change gets the same investigation.
            </h2>
            <p className="g-body">Grants, scaling, content rules: one engine, the same evidence, three possible verdicts.</p>
          </Reveal>
          <div className="g-arrows">
            <button type="button" className="g-square" aria-label="Previous case" disabled={at === 0} onClick={() => setAt((p) => Math.max(0, p - 1))}>
              <Arrow left />
            </button>
            <button type="button" className="g-square" aria-label="Next case" disabled={at >= last} onClick={() => setAt((p) => Math.min(last, p + 1))}>
              <Arrow />
            </button>
          </div>
        </div>
        <Reveal delay={1}>
          <div className="k-track">
            <div className="k-intro" data-state={state(0)}>
              <div className="k-intro-in">
                <h3>
                  See how Domino tests a change. <span>Step through {cards.length} recorded changes, each investigated end to end against the systems around it.</span>
                </h3>
                <div className="k-intro-row">
                  <span>
                    {cards.length} changes · {runs} recorded runs
                  </span>
                  <button type="button" className="g-btn g-btn-accent" onClick={() => setAt(1)}>
                    Start with the first
                  </button>
                </div>
              </div>
            </div>
            {cards.map((k, i) => (
              <Panel key={k.id} c={k} i={i} state={state(i + 1)} onPick={() => setAt(i + 1)} />
            ))}
          </div>
          <div className="k-foot">
            <p key={at} className="k-caption">
              {c ? (
                <>
                  {c.measure} {c.baseline} → {c.candidate}
                  {c.limit != null ? ` · limit ${c.limit}` : ''} · <b className={c.failed ? 'g-fail' : undefined}>{c.verdictLabel.toLowerCase()}</b>
                  {c.runs > 1 ? ` · ${c.agreeing} of ${c.runs} runs agree` : ''}
                </>
              ) : (
                'Grants · Scaling · Content rules'
              )}
            </p>
            <a className="k-explore" href={c ? href.case(c.id) : href.cases}>
              {c ? 'Explore case' : 'All cases'}
              <Arrow />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

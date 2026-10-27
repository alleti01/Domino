// "How it works": the console's real Live check, playing a recorded run. One
// screen tall, no scroll pinning. The steps sit on the left as an accordion
// (the active one opens with a line of explanation and a progress bar); the
// console plays on the right on its own clock while the section is on screen,
// then moves on to a change with the other verdict. Clicking a step jumps there.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import '../../../dash/dash.css'
import { CheckPlayer } from '../../../dash/pages/LiveCheck'
import type { CaseEntry, Investigation, SiteData, TraceStep } from '../../../types'
import type { Showcase } from '../../../lib/showcase'

const MODES = [
  { label: 'A change comes in', text: 'A pull request opens. Domino reads what it changes.', types: ['run_started', 'change_parsed'] },
  { label: 'Domino maps the pipeline', text: 'It asks every connected system what the change touches.', types: ['usl_query', 'dependency_path'] },
  { label: 'It guesses what could break', text: 'It writes down what could fail, as something it can test.', types: ['hypothesis'] },
  { label: 'It tests that in a copy', text: 'It runs the app without the change, with it, and with it undone.', types: ['experiment_requested', 'experiment_result'] },
  { label: 'A second AI double-checks', text: 'A larger model checks the explanation against the proof.', types: ['review', 'revision'] },
  { label: 'Code gives the answer', text: 'Plain code reads the runs and gives the verdict.', types: ['verdict', 'run_finished'] },
]
const HOLD_MS = 5000

/** The console's own clock: each event's time in ms, about 22 s in all. */
function schedule(trace: TraceStep[]): number[] {
  const offs = trace.map((s) => s.offsetMs ?? 0)
  const total = Math.max(1, offs[offs.length - 1] ?? 1)
  const scale = 22000 / total
  const times: number[] = []
  let t = 600
  for (let i = 0; i < trace.length; i++) {
    if (i > 0) t += Math.max(140, Math.min(1500, (offs[i] - offs[i - 1]) * scale))
    times.push(t)
  }
  return times
}

/** The event index where each mode begins (kept in order). */
function modeStarts(trace: TraceStep[]) {
  const out: number[] = []
  let floor = 0
  for (const m of MODES) {
    const i = trace.findIndex((e, k) => k >= floor && m.types.includes(e.type))
    const at = i < 0 ? floor : i
    out.push(at)
    floor = at
  }
  return out
}

interface Pick {
  inv: Investigation
  caseEntry: CaseEntry
}

export function LiveSection({ site, show }: { site: SiteData; show: Showcase }) {
  const picks = useMemo<Pick[]>(() => {
    const first = { inv: show.inv, caseEntry: show.caseEntry }
    const other = site.cases
      .flatMap((c) => c.runs.flatMap((r) => (r.load.ok ? [{ inv: r.load.investigation, caseEntry: c }] : [])))
      .find((p) => p.inv.verdict && p.inv.verdict.verdict !== show.inv.verdict?.verdict && p.inv.trace.length > 10)
    return other ? [first, other] : [first]
  }, [site, show])

  const [i, setI] = useState(0)
  const [t, setT] = useState(0)
  const clock = useRef(0)
  const root = useRef<HTMLElement>(null)
  const p = picks[i % picks.length]
  const times = useMemo(() => schedule(p.inv.trace), [p])
  const starts = useMemo(() => modeStarts(p.inv.trace), [p])
  const end = (times[times.length - 1] ?? 0) + 300
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

  // Play while on screen; hold on the result, then the other change.
  useEffect(() => {
    if (reduce) {
      clock.current = end
      return
    }
    let visible = false
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.35 })
    if (root.current) io.observe(root.current)
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(100, now - last)
      last = now
      if (!visible || document.hidden) return
      clock.current += dt
      if (clock.current >= end + HOLD_MS) {
        clock.current = 0
        setI((v) => (v + 1) % picks.length)
      }
      setT(clock.current)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [end, picks.length, reduce])

  const now = reduce ? end : t
  const step = times.filter((x) => x <= now).length
  const at = (k: number) => times[starts[k]] ?? 0
  const mode = MODES.reduce((acc, _, k) => (now >= at(k) - 1 ? k : acc), 0)
  const fill = (k: number) => {
    if (k < mode) return 1
    if (k > mode) return 0
    const next = k + 1 < MODES.length ? at(k + 1) : end
    return Math.min(1, Math.max(0, (now - at(k)) / Math.max(1, next - at(k))))
  }
  const jump = (k: number) => {
    clock.current = at(k)
    setT(clock.current)
  }
  const pick = (k: number) => {
    clock.current = 0
    setT(0)
    setI(k)
  }

  return (
    <section ref={root} id="how" className="lx" aria-labelledby="how-title">
      <div className="lx-copy">
        <p className="g-label">How it works</p>
        <h2 id="how-title" className="g-h2 lx-h2">
          Watch Domino
          <br />
          check a change.
        </h2>
        <ol className="lx-steps">
          {MODES.map((m, k) => (
            <li key={m.label} className={k === mode ? 'is-on' : k < mode ? 'is-done' : undefined} style={{ '--f': fill(k) } as CSSProperties}>
              <button type="button" onClick={() => jump(k)} aria-current={k === mode}>
                <span className="lx-num">0{k + 1}</span>
                <span className="lx-title">{m.label}</span>
              </button>
              <div className="lx-more">
                <div>
                  <p>{m.text}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
        {picks.length > 1 && (
          <div className="lx-cases" role="tablist" aria-label="Recorded change">
            {picks.map((q, k) => {
              const bad = q.inv.verdict?.verdict === 'reproduced_failure'
              return (
                <button key={q.inv.runId} type="button" role="tab" aria-selected={k === i} className={k === i ? 'is-on' : undefined} onClick={() => pick(k)}>
                  <i className={bad ? 'is-fail' : 'is-ok'} />
                  {q.caseEntry.label}
                  <small>{bad ? 'breaks something' : 'no failure found'}</small>
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className="lx-stage">
        <div className="dx lx-dx">
          <CheckPlayer key={`${p.inv.runId}:${i}`} inv={p.inv} caseEntry={p.caseEntry} live={false} step={step} />
        </div>
      </div>
    </section>
  )
}

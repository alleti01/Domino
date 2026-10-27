// Results, set out like a benchmark figure: two small charts drawn from the
// recorded runs (the verdict of every run of every setup, and how long each run
// took), a methodology column beside them, and one line of key figures.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { SiteData } from '../../../types'
import { href } from '../../../lib/router'
import type { Showcase } from '../../../lib/showcase'
import { siteFacts } from './data'

interface Row {
  id: string
  family: string
  system: string
  runs: { verdict: string | null; secs: number | null }[]
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`

export function Grid({ site }: { site: SiteData; show?: Showcase }) {
  const f = siteFacts(site)
  const root = useRef<HTMLElement>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setOn(true), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const rows: Row[] = site.cases.map((c) => {
    const [family, system] = c.label.split(' · ')
    return {
      id: c.id,
      family: family ?? c.label,
      system: system ?? '',
      runs: c.runs.flatMap((r) => (r.load.ok ? [{ verdict: r.load.investigation.verdict?.verdict ?? null, secs: r.load.investigation.durationMs != null ? r.load.investigation.durationMs / 1000 : null }] : [])).slice(0, 3),
    }
  })
  const maxRuns = Math.max(1, ...rows.map((r) => r.runs.length))
  const dots = rows.flatMap((r) => r.runs.flatMap((x) => (x.secs != null ? [{ secs: x.secs, bad: x.verdict === 'reproduced_failure' }] : [])))
  const maxSecs = Math.max(60, ...dots.map((d) => d.secs))
  const axisMax = Math.ceil(maxSecs / 60) * 60
  const median = f.medianSeconds ?? 0
  const pct = f.answeredCalls ? Math.floor((100 * f.nemotronCalls) / f.answeredCalls) : 0
  const x = (s: number) => `${(s / axisMax) * 100}%`
  // a fixed small jitter per dot so they don't overlap
  const jitter = (i: number) => ((i * 37) % 11) / 11
  const per = f.worlds ? Math.round(f.runs / f.worlds) : 0

  return (
    <section ref={root} id="results" className={`bn${on ? ' is-on' : ''}`} aria-labelledby="results-title">
      <div className="bn-head">
        <div>
          <p className="g-label">Results</p>
          <h2 id="results-title" className="bn-h2">
            Measured on real runs.
          </h2>
        </div>
        <p className="bn-lead">
          {f.worlds} test setups, {per} runs each. {pct}% of {f.answeredCalls} AI calls on NVIDIA Nemotron.{' '}
          <a href={href.results}>Full results →</a>
        </p>
      </div>

      <div className="bn-fig">
        <figure className="bn-panel">
          <header className="bn-take">
            <p className="bn-big">
              {f.steady}/{f.worlds}
            </p>
            <p>
              <b>Same answer every time.</b> Each setup was tested {per} times and got the same verdict every run.
            </p>
          </header>
          <div className="bn-matrix" style={{ '--cols': maxRuns } as CSSProperties}>
            <span className="bn-key">
              <i className="is-bad" /> Breaks <i className="is-ok" /> No failure
            </span>
            {Array.from({ length: maxRuns }, (_, k) => (
              <span key={k} className="bn-colh">
                Run {k + 1}
              </span>
            ))}
            {rows.map((r, ri) => (
              <div key={r.id} className="bn-row">
                <span className="bn-rowh">
                  {r.family} <em>{r.system.replace('System ', '')}</em>
                </span>
                {r.runs.map((v, k) => (
                  <i
                    key={k}
                    className={v.verdict === 'reproduced_failure' ? 'is-bad' : v.verdict === 'no_failure_observed' ? 'is-ok' : 'is-unk'}
                    style={{ '--d': `${(ri * maxRuns + k) * 22}ms` } as CSSProperties}
                  />
                ))}
              </div>
            ))}
          </div>
        </figure>

        <figure className="bn-panel">
          <header className="bn-take">
            <p className="bn-big">{fmtTime(median)}</p>
            <p>
              <b>From a change to an answer.</b> Typical time per check. Each dot is one of the {f.runs} runs.
            </p>
          </header>
          <div className="bn-plot">
            <div className="bn-track" style={{ '--ticks': axisMax / 60 } as CSSProperties}>
              <em className="bn-median-line" style={{ left: x(median) }}>
                <span>median</span>
              </em>
              {dots.map((d, i) => (
                <i key={i} className="is-run" style={{ left: x(d.secs), top: `${14 + jitter(i) * 72}%`, '--d': `${i * 30}ms` } as CSSProperties} />
              ))}
            </div>
            <div className="bn-ticks">
              {Array.from({ length: axisMax / 60 + 1 }, (_, k) => (
                <span key={k} style={{ left: x(k * 60) }}>
                  {k} min
                </span>
              ))}
            </div>
          </div>
        </figure>
      </div>
    </section>
  )
}

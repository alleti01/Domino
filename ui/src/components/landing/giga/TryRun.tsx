// What a judge sees after pressing Investigate: the test Domino writes for the
// change, in plain words, then a scan of each step as it happens (reading the
// change, the semantic layer, Nemotron, the sandbox runs, the reviewer, the
// judge), then the result. It is a sped-up replay of a recorded run and says so.
// The console shows it as a page (Live check); `modal` floats it over a page.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ARM_LABEL, type Arm, type Scenario } from './tryScenarios'
import './tryrun.css'

type Stage = 'read' | 'map' | 'think' | 'sandbox' | 'review' | 'verdict'
type Tone = 'info' | 'ok' | 'fail' | 'warn' | 'muted'

const STAGES: { key: Stage; label: string }[] = [
  { key: 'read', label: 'Read the change' },
  { key: 'map', label: 'Map what it touches' },
  { key: 'think', label: 'Form a hypothesis' },
  { key: 'sandbox', label: 'Run the test' },
  { key: 'review', label: 'Review' },
  { key: 'verdict', label: 'Verdict' },
]

interface Beat {
  at: number
  stage: Stage
  line?: { text: string; detail?: string; path?: string[]; tone: Tone; who?: string }
  /** Index into scenario.runs whose result lands on this beat. */
  run?: number
  /** Index into scenario.runs that starts on this beat. */
  starting?: number
}

/** The script: when each line appears, in ms from the press. About 15 s end to end. */
function script(s: Scenario): Beat[] {
  const out: Beat[] = []
  let t = 300
  const add = (gap: number, b: Omit<Beat, 'at'>) => {
    t += gap
    out.push({ ...b, at: t })
  }
  add(0, { stage: 'read', line: { text: 'Reading the change', detail: s.file, tone: 'info', who: 'Domino' } })
  add(1000, { stage: 'map', line: { text: 'Asking the semantic layer what this change reaches', detail: `${s.queries} queries`, tone: 'info', who: 'Zetaris' } })
  add(1500, { stage: 'map', line: { text: 'Found the path', path: s.path, tone: 'info', who: 'Zetaris' } })
  add(1400, { stage: 'think', line: { text: 'Hypothesis', detail: s.hypothesis, tone: 'info', who: 'Nemotron' } })
  add(1600, { stage: 'think', line: { text: 'Wrote the test', detail: s.test, tone: 'info', who: 'Nemotron' } })
  s.runs.forEach((r, i) => {
    add(i === 0 ? 1300 : 500, { stage: 'sandbox', starting: i })
    const failed = r.results.some((x) => !x)
    add(1000, {
      stage: 'sandbox',
      run: i,
      line: { text: `${ARM_LABEL[r.arm]}${r.again ? ', again' : ''}: ${failed ? 'failed' : 'passed'}`, detail: r.note, tone: failed ? 'fail' : 'ok', who: 'Sandbox' },
    })
  })
  add(1100, { stage: 'review', line: { text: s.review.text, tone: s.review.tone, who: 'Reviewer' } })
  add(1100, {
    stage: 'verdict',
    line: {
      text: s.result.failed ? 'Judge: failure reproduced' : 'Judge: no failure observed',
      detail: s.result.failed ? 'It fails with the change and passes without it and after rolling it back.' : 'Every check passed with the change, as without it.',
      tone: s.result.failed ? 'fail' : 'ok',
      who: 'Judge',
    },
  })
  return out
}

const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

function Mark({ state }: { state: 'pending' | 'running' | 'pass' | 'fail' }) {
  return (
    <span className={`tr-mark is-${state}`} aria-label={state === 'pass' ? 'Passed' : state === 'fail' ? 'Failed' : state === 'running' ? 'Running' : 'Not run yet'}>
      {state === 'pass' ? '✓' : state === 'fail' ? '✕' : state === 'running' ? <i className="tr-spin" /> : null}
    </span>
  )
}

/** The checks, one column per arm, filling in as the sandbox runs land. */
function Checks({ s, landed, starting }: { s: Scenario; landed: Set<number>; starting: number | null }) {
  const arms = (['without', 'with', 'reverted'] as Arm[]).filter((a) => s.runs.some((r) => r.arm === a))
  const cell = (arm: Arm, check: number): 'pending' | 'running' | 'pass' | 'fail' => {
    const idx = s.runs.map((r, i) => ({ r, i })).filter((x) => x.r.arm === arm)
    const done = idx.filter((x) => landed.has(x.i))
    if (done.length) return done.every((x) => x.r.results[check]) ? 'pass' : 'fail'
    return idx.some((x) => x.i === starting) ? 'running' : 'pending'
  }
  return (
    <table className="tr-checks">
      <thead>
        <tr>
          <th>Check</th>
          {arms.map((a) => (
            <th key={a}>{ARM_LABEL[a]}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {s.checks.map((c, i) => (
          <tr key={c}>
            <td>{c}</td>
            {arms.map((a) => (
              <td key={a}>
                <Mark state={cell(a, i)} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Bars({ s }: { s: Scenario }) {
  const m = s.measure
  const max = Math.max(m.without, m.with, m.limit ?? 0) * 1.12 || 1
  const pct = (v: number) => `${(v / max) * 100}%`
  const over = m.limit != null ? m.with > m.limit : s.result.failed
  return (
    <div className="tr-bars">
      <div className="tr-bars-h">
        <span>{m.label}</span>
        {m.limit != null && <span className="tr-faint">{m.limitLabel ?? `limit ${m.limit}`}</span>}
      </div>
      {(
        [
          ['Without the change', m.without, false],
          ['With the change', m.with, over],
        ] as const
      ).map(([label, v, bad]) => (
        <div key={label} className="tr-bar">
          <span className="tr-bar-l">{label}</span>
          <span className="tr-bar-track">
            <span className={`tr-bar-fill${bad ? ' is-bad' : ''}`} style={{ width: pct(v) }} />
            {m.limit != null && <span className="tr-bar-limit" style={{ left: pct(m.limit) }} />}
          </span>
          <b className={bad ? 'is-bad' : undefined}>{v}</b>
        </div>
      ))}
    </div>
  )
}

export function TryRun({
  scenario: s,
  onClose,
  variant = 'page',
  reportHref,
}: {
  scenario: Scenario
  onClose: () => void
  variant?: 'page' | 'modal'
  /** The run's full report in the console, offered once the check ends. */
  reportHref?: string
}) {
  const modal = variant === 'modal'
  const beats = useMemo(() => script(s), [s])
  const [n, setN] = useState(0)
  const [round, setRound] = useState(0)
  const close = useRef<HTMLButtonElement>(null)
  const feed = useRef<HTMLOListElement>(null)
  const done = n >= beats.length
  const [showResult, setShowResult] = useState(false)

  // Play the script; reduced motion shows the end state at once.
  useEffect(() => {
    setShowResult(false)
    if (reduceMotion()) {
      setN(beats.length)
      setShowResult(true)
      return
    }
    setN(0)
    const timers = beats.map((b, i) => setTimeout(() => setN(i + 1), b.at))
    const last = beats[beats.length - 1]?.at ?? 0
    timers.push(setTimeout(() => setShowResult(true), last + 1100))
    return () => timers.forEach(clearTimeout)
  }, [beats, round])

  // Modal: Esc closes; the page behind doesn't scroll; focus starts on Close and returns after.
  useEffect(() => {
    if (!modal) return
    const prev = document.activeElement as HTMLElement | null
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      prev?.focus?.()
    }
  }, [onClose, modal])

  // Keep the newest line in view.
  useLayoutEffect(() => {
    const el = feed.current
    if (el) el.scrollTop = el.scrollHeight
  }, [n])

  const seen = beats.slice(0, n)
  const stage = seen[seen.length - 1]?.stage ?? 'read'
  const stageIdx = STAGES.findIndex((x) => x.key === stage)
  const landed = new Set(seen.flatMap((b) => (b.run != null ? [b.run] : [])))
  const lastStart = [...seen].reverse().find((b) => b.starting != null)?.starting ?? null
  const starting = lastStart != null && !landed.has(lastStart) ? lastStart : null
  const sandboxFailed = s.runs.some((r, i) => landed.has(i) && r.results.some((x) => !x))
  const lines = seen.filter((b) => b.line)
  const progress = beats.length ? Math.min(1, n / beats.length) : 1

  const window = (
        <section className="tr-window" role={modal ? 'dialog' : 'region'} aria-modal={modal || undefined} aria-labelledby="tr-title">
          <header className="tr-head">
            <div className="tr-head-text">
              <span className="tr-kind">
                {s.kind} · {s.system}
              </span>
              <h2 id="tr-title">{s.title}</h2>
            </div>
            <span className={`tr-status ${showResult ? (s.result.failed ? 'is-fail' : 'is-ok') : 'is-run'}`}>
              {showResult ? (
                <>
                  <i className="tr-dot" /> {s.result.failed ? 'Failed' : 'Passed'}
                </>
              ) : (
                <>
                  <i className="tr-spin" /> Checking
                </>
              )}
            </span>
            {modal && (
              <button ref={close} type="button" className="tr-x" onClick={onClose} aria-label="Close">
                ✕
              </button>
            )}
          </header>

          <ol className="tr-stages" aria-label="Progress">
            {STAGES.map((st, i) => {
              let state = done || i < stageIdx ? 'done' : i === stageIdx ? 'now' : 'todo'
              if (st.key === 'sandbox' && sandboxFailed && state !== 'todo') state = state === 'now' ? 'now' : 'fail'
              if (st.key === 'verdict' && done && s.result.failed) state = 'fail'
              return (
                <li key={st.key} className={`is-${state}`}>
                  <span className="tr-stage-mark" />
                  <span>{st.label}</span>
                </li>
              )
            })}
          </ol>

          <div className="tr-body">
            <div className="tr-left">
              {showResult ? (
                <div className="tr-result">
                  <p className={`tr-verdict ${s.result.failed ? 'is-fail' : 'is-ok'}`}>{s.result.headline}</p>
                  <p className="tr-why">{s.result.why}</p>
                  <Bars s={s} />
                  <Checks s={s} landed={landed} starting={null} />
                  {s.result.fix && (
                    <div className="tr-fix">
                      <span className="tr-label">Suggested fix · not tested in this run</span>
                      <p>{s.result.fix}</p>
                    </div>
                  )}
                  <p className="tr-stats">
                    {s.stats.sandboxRuns} sandbox runs · {s.stats.modelCalls} model calls, all Nemotron · took {s.stats.duration}
                  </p>
                  <div className="tr-actions">
                    {reportHref && (
                      <a className="tr-btn is-primary" href={reportHref}>
                        Open the full report →
                      </a>
                    )}
                    <button type="button" className={`tr-btn${reportHref ? '' : ' is-primary'}`} onClick={() => setRound((r) => r + 1)}>
                      Watch again
                    </button>
                    <button type="button" className="tr-btn" onClick={onClose}>
                      Try another change
                    </button>
                  </div>
                </div>
              ) : (
                <div className="tr-plan">
                  <span className="tr-label">The change</span>
                  <p>{s.change}</p>
                  <code className="tr-file">{s.file}</code>
                  <span className="tr-label">The test Domino runs</span>
                  <p>{s.test}</p>
                  <Checks s={s} landed={landed} starting={starting} />
                  {landed.size > 0 && <Bars s={s} />}
                </div>
              )}
            </div>

            <div className="tr-right">
              <div className="tr-scan" aria-hidden="true" data-on={!done} />
              <ol className="tr-feed" ref={feed} aria-live="polite">
                {lines.map((b, i) => {
                  const l = b.line!
                  return (
                    <li key={`${round}-${i}`} className={`tone-${l.tone}`}>
                      <span className="tr-who">{l.who}</span>
                      <div>
                        <b>{l.text}</b>
                        {l.detail && <span className="tr-detail">{l.detail}</span>}
                        {l.path && (
                          <span className="tr-path">
                            {l.path.map((p, k) => (
                              <span key={p}>
                                {k > 0 && <i>→</i>}
                                <em>{p}</em>
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
                {starting != null && (
                  <li className="tone-muted is-pending">
                    <span className="tr-who">Sandbox</span>
                    <div>
                      <b>
                        <i className="tr-spin" /> Running {ARM_LABEL[s.runs[starting].arm].toLowerCase()}
                        {s.runs[starting].again ? ', again' : ''}
                      </b>
                    </div>
                  </li>
                )}
              </ol>
            </div>
          </div>

          <footer className="tr-foot">
            <span>Replay of a recorded run on a synthetic system, sped up from {s.stats.duration}. Nothing is sent anywhere.</span>
            <span className="tr-progress" aria-hidden="true">
              <span style={{ width: `${progress * 100}%` }} />
            </span>
          </footer>
        </section>
  )

  if (!modal) return <div className="g tr-page">{window}</div>
  return createPortal(
    <div className="g">
      <div className="tr-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {window}
      </div>
    </div>,
    document.body,
  )
}

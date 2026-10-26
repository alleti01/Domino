import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { HEADLINE, HERO_SUB } from '../../../content'
import { VERDICT, isNemotron, shortModel } from '../../../lib/labels'
import { href } from '../../../lib/router'
import type { Showcase } from '../../../lib/showcase'
import { Arrow, ArrowLink } from '../Motion'
import { JUDGE_RULE, heldState, relationText, runTime, shortName, storyData, type StoryData } from './storyData'

const DominoScene = lazy(() => import('./DominoScene'))

const VARIANT_LABEL: Record<string, string> = { baseline: 'Baseline', candidate: 'Candidate', control: 'Control' }
const VARIANT_NOTE: Record<string, string> = {
  baseline: 'without the change',
  candidate: 'with the change',
  control: 'change undone',
}

/**
 * The opening of the landing page: one object, one investigation, five frames.
 * Each chapter pins its copy around the scene while the scene holds that
 * chapter's state, then hands over to the next. All text is ordinary HTML;
 * without WebGL (or if the scene fails to start) a still composition stands in.
 */
export function Story({ show, placeholder }: { show: Showcase | null; placeholder: boolean }) {
  const data = useMemo(() => (show ? storyData(show) : null), [show])
  const section = useRef<HTMLElement>(null)
  const progress = useRef(0)
  const huds = useRef<Record<string, HTMLElement | null>>({})
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  // Phones and portrait tablets stack the copy around the scene instead of framing it.
  const compact = useMediaQuery('(max-width: 760px), (max-aspect-ratio: 1/1)')
  const [webgl] = useState(hasWebGL)
  const [active, setActive] = useState(true)

  // Scroll position → story time. Chapter n holds n − 0.25 … n + 0.25 while its
  // frame is pinned; the half-step between is the hand-over to the next chapter.
  useEffect(() => {
    const el = section.current
    if (!el) return
    let points: [number, number][] = []
    let runs: HTMLElement[] = []
    let sources: HTMLElement[] = []
    const measure = () => {
      const vh = window.innerHeight
      const chapters = [...el.querySelectorAll<HTMLElement>('[data-chapter]')]
      points = chapters.flatMap((ch, n) => {
        const top = ch.getBoundingClientRect().top + window.scrollY
        const end = Math.max(top + 1, top + ch.offsetHeight - vh)
        return [
          [top, n === 0 ? 0 : n - 0.25],
          [end, n + 0.25],
        ] as [number, number][]
      })
      runs = [...el.querySelectorAll<HTMLElement>('[data-run]')]
      sources = [...el.querySelectorAll<HTMLElement>('[data-source]')]
    }
    const update = () => {
      if (points.length < 2) measure()
      const y = window.scrollY
      let s = points[0]?.[1] ?? 0
      for (let i = 0; i < points.length - 1; i++) {
        const [y0, s0] = points[i]
        const [y1, s1] = points[i + 1]
        if (y >= y0) s = y >= y1 ? s1 : s0 + ((s1 - s0) * (y - y0)) / Math.max(1, y1 - y0)
      }
      progress.current = s
      el.style.setProperty('--s', s.toFixed(3))
      // Lists that follow the scene: sources light up as they connect, runs as they play.
      const shown = reduced ? heldState(s) : s
      sources.forEach((li, i) => li.classList.toggle('is-lit', shown >= 0.75 + (i * 0.4) / Math.max(1, sources.length)))
      runs.forEach((li, i) => li.classList.toggle('is-lit', shown >= runTime(i, runs.length)))
    }
    const refresh = () => {
      measure()
      update()
    }
    refresh()
    const ro = new ResizeObserver(refresh)
    ro.observe(el)
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', refresh)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', refresh)
    }
  }, [compact, data, reduced])

  // Stop rendering once the story is off screen.
  useEffect(() => {
    const el = section.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { rootMargin: '100px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const still = <StillStage />
  const reportHref = show ? href.case(show.caseEntry.id) : href.cases

  return (
    <section ref={section} className="story" data-nav-theme="dark" aria-labelledby="hero-title">
      <div className="story-stage" aria-hidden="true">
        <div className="story-atmos" />
        {webgl && data ? (
          <SceneBoundary fallback={still}>
            <Suspense fallback={null}>
              <DominoScene data={data} progress={progress} huds={huds} reduced={reduced} compact={compact} active={active} />
            </Suspense>
          </SceneBoundary>
        ) : (
          still
        )}
        {webgl && data && <Readouts data={data} huds={huds} />}
        <div className="story-vignette" />
      </div>

      <div className="story-content">
        <section className="chapter chapter-hero" data-chapter="0" aria-labelledby="hero-title">
          <div className="chapter-frame">
            <h1 id="hero-title" className="hero-title">
              <span className="hero-kicker">Pre-deployment failure investigation</span>
              <span className="hero-line">{HEADLINE[0]}</span>
              <em className="hero-line hero-line-tail">{HEADLINE[1]}</em>
            </h1>
            <div className="hero-foot">
              <p className="hero-sub">{HERO_SUB}</p>
              <div className="hero-actions">
                <a className="btn-chamfer" href={reportHref}>
                  Open a real investigation
                  <Arrow />
                </a>
                <a className="story-secondary" href={href.try}>
                  Try it yourself
                </a>
              </div>
            </div>
            <div className="hero-meta">
              {show && <RunStamp show={show} placeholder={placeholder} />}
              <p className="story-scroll" aria-hidden="true">
                Scroll to follow one investigation
              </p>
            </div>
          </div>
        </section>

        {data ? (
          <Chapters data={data} reportHref={reportHref} />
        ) : (
          <p className="chapter-empty">The investigation appears here once a run is saved.</p>
        )}
      </div>
    </section>
  )
}

function Chapters({ data, reportHref }: { data: StoryData; reportHref: string }) {
  const at = (section: string) => href.case(data.caseId, { section })
  const change = data.path[0]
  const a = data.assumption
  const x = data.experiment
  const v = data.verdict ? VERDICT[data.verdict.verdict] : null
  const counts = { observed: 0, inferred: 0, unresolved: 0 }
  data.links.forEach((l) => counts[l.status]++)
  const total = data.path.length + data.others.length
  const runs = data.runs.slice(0, 4)
  const repeats = runs.filter((r) => r.variant === 'candidate').length

  return (
    <>
      {/* 1 · Heading above the scene, explanation below. */}
      <section id="how" className="chapter chapter-connect" data-chapter="1" aria-labelledby="ch-connect">
        <div className="chapter-frame">
          <header className="chapter-head">
            <p className="chapter-kicker">
              <span>01</span> Connect the facts
            </p>
            <h2 id="ch-connect" className="chapter-title">
              One change. <em>Facts in {data.sources.length} systems.</em>
            </h2>
          </header>
          <div className="chapter-body connect-body">
            <p>
              Whether change <code>{change.label}</code> is harmless depends on facts kept in different places: code,
              permissions, configuration and catalogued data. Domino follows its relationships through the{' '}
              <strong>Zetaris semantic layer</strong>, which joins those sources into one graph, and keeps the source row behind
              every link.
            </p>
            <div className="connect-detail">
              <ul className="connect-sources" aria-label="Sources joined in this run">
                {data.rowsBySource.map((r) => (
                  <li key={r.source} data-source>
                    <code>{r.source}</code>
                    <span>
                      {r.rows} {r.rows === 1 ? 'row' : 'rows'}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="connect-path">
                <span className="visually-hidden">Dependency path: </span>
                {data.path.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && <span className={`connect-rel ${data.links[i - 1].status}`}> {relationText(data.links[i - 1].relation)} </span>}
                    <code>{p.label}</code>
                  </span>
                ))}
              </p>
              <p className="chapter-links">
                <ArrowLink href={at('chain')}>The chain with its source rows</ArrowLink>
                <ArrowLink href={href.underTheHoodAt('zetaris')}>Zetaris sources and checks</ArrowLink>
              </p>
              <p className="chapter-note">
                {data.path.length} of the {total} components the semantic layer returned sit on this path; the scene shows those.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2 · The relationship in close-up, the explanation beside it. */}
      <section id="assumption" className="chapter chapter-assumption" data-chapter="2" aria-labelledby="ch-assumption">
        <div className="chapter-frame">
          <div className="chapter-panel">
            <p className="chapter-kicker">
              <span>02</span> Find the assumption
            </p>
            <h2 id="ch-assumption" className="chapter-title">
              {a ? (
                <>
                  One link is <em>inferred, not observed.</em>
                </>
              ) : (
                <>
                  Every link was <em>observed.</em>
                </>
              )}
            </h2>
            {a ? (
              <p>
                <code>{data.path[a.from].label}</code> {relationText(a.relation)} <code>{data.path[a.to].label}</code> wasn't read
                from a retrieved row; Domino inferred it from the evidence around it. It may be written down elsewhere, so it gets
                tested rather than trusted.
              </p>
            ) : (
              <p>Nothing on this path rests on inference, so the test targets the end of the path.</p>
            )}
            <dl className="link-legend" aria-label="Links on this path">
              <div className="observed">
                <dt>{counts.observed} observed</dt>
                <dd>read from a retrieved row</dd>
              </div>
              <div className="inferred">
                <dt>{counts.inferred} inferred</dt>
                <dd>proposed from evidence around it</dd>
              </div>
              <div className="unresolved">
                <dt>{counts.unresolved} unresolved</dt>
                <dd>neither confirmed nor ruled out</dd>
              </div>
            </dl>
            {a && (
              <p className="assumption-question">
                The question worth testing: after change {change.label}, does <strong>{shortName(data.path[a.from]).toLowerCase()}</strong>{' '}
                still stay within <strong>{shortName(data.path[a.to]).toLowerCase()}</strong>? An experiment can answer it either way.
              </p>
            )}
            <p className="chapter-note">
              What to suspect and which experiment would settle it: reasoned by NVIDIA Nemotron through Meterless Nightshift (
              {data.evidence.nemotron}/{data.evidence.calls} model calls in this run).
            </p>
            <p className="chapter-links">
              <ArrowLink href={at('hypotheses')}>The hypotheses, as the model wrote them</ArrowLink>
              <ArrowLink href={href.underTheHoodAt('nemotron')}>Nemotron receipts</ArrowLink>
            </p>
          </div>
        </div>
      </section>

      {/* 3 · Heading above, the runs side by side below, so they compare at a glance. */}
      <section id="experiment" className="chapter chapter-experiment" data-chapter="3" aria-labelledby="ch-experiment">
        <div className="chapter-frame">
          <header className="chapter-head">
            <p className="chapter-kicker">
              <span>03</span> Test it and revert it
            </p>
            <h2 id="ch-experiment" className="chapter-title">
              Run it in a sandbox. <em>Then undo it.</em>
            </h2>
            <p className="chapter-lede">
              Same workload, isolated copy, one difference: the change.{repeats > 1 && ' The candidate runs twice to show the failure is stable.'}{' '}
              The control undoes the change; if the failure leaves with it, the change caused it.
            </p>
          </header>
          {x && (
            <div className="chapter-body experiment-body">
              <ol className="run-strip" aria-label={`Sandbox runs, measuring ${x.key}`}>
                {runs.map((r, i) => (
                  <li key={r.id} data-run className={r.outcome === 'pass' ? 'pass' : 'fail'}>
                    <span className="run-name">
                      {VARIANT_LABEL[r.variant] ?? r.variant}
                      {r.variant === 'candidate' && runs.slice(0, i).some((p) => p.variant === 'candidate') && ', again'}
                    </span>
                    <span className="run-note">{VARIANT_NOTE[r.variant] ?? ''}</span>
                    <span className="run-value">{r.value == null ? '—' : String(r.value)}</span>
                    <span className="run-outcome">{r.outcome === 'pass' ? '✓ Passed' : r.outcome === 'fail' ? '✕ Failed' : '✕ Error'}</span>
                  </li>
                ))}
              </ol>
              <p className="experiment-measure">
                Measuring <code>{x.key}</code>
                {x.limit && (
                  <>
                    {' '}
                    against <code>{x.limit.name}</code>
                    {x.limit.value != null && <> = {x.limit.value}</>}
                    {x.limit.evidenceId && (
                      <>
                        , stated in row <code>{x.limit.evidenceId}</code>
                      </>
                    )}
                  </>
                )}
                .{x.failure && (
                  <>
                    {' '}
                    The candidate failed <code>{x.failure}</code>.
                  </>
                )}
              </p>
              <p className="chapter-note">
                Meterless World Model holds the investigation's state, updating each hypothesis as results arrive (
                {data.evidence.memory} reads and writes). It records results; it doesn't run experiments.
              </p>
              <p className="chapter-links">
                <ArrowLink href={at('experiments')}>Every run with its logs</ArrowLink>
                <ArrowLink href={href.underTheHoodAt('meterless')}>Meterless activity</ArrowLink>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 4 · The object settles; the evidence rises beneath it. */}
      <section id="result" className="chapter chapter-result" data-chapter="4" aria-labelledby="ch-result">
        <div className="chapter-frame">
          <div className="chapter-panel result-panel">
            <header className="result-head">
              <p className="chapter-kicker">
                <span>04</span> Inspect the result
              </p>
              <h2 id="ch-result" className="chapter-title">
                Code decides. <em>A second model checks the story.</em>
              </h2>
            </header>
            <div className="result-grid">
              <div>
                <h3>Verdict</h3>
                {data.verdict && v ? (
                  <>
                    <p className={`result-verdict tone-${v.tone}`}>{v.label}</p>
                    <p>Decided by Domino's deterministic judge. {JUDGE_RULE[data.verdict.verdict]}</p>
                  </>
                ) : (
                  <p>This run has no verdict yet.</p>
                )}
              </div>
              <div>
                <h3>Review</h3>
                <p className="result-verdict">{data.review ? data.review.replace('_', ' ') : 'Not reviewed'}</p>
                <p>
                  A second model{data.reviewerModel && <> ({shortModel(data.reviewerModel)})</>} checked the explanation against the
                  retrieved evidence. It reviews the explanation; it can't change the verdict.
                </p>
              </div>
              <div>
                <h3>Evidence</h3>
                <ul className="result-stats">
                  <li>
                    <strong>{data.evidence.rows}</strong> source rows cited
                  </li>
                  <li>
                    <strong>{data.runs.length}</strong> sandbox runs
                  </li>
                  <li>
                    <strong>{data.evidence.calls}</strong> model calls, each with a receipt
                  </li>
                </ul>
              </div>
            </div>
            <div className="result-actions">
              <a className="btn-chamfer" href={reportHref}>
                Open the full report
                <Arrow />
              </a>
              <ArrowLink href={at('verdict')}>Evidence and limitations</ArrowLink>
              <ArrowLink href={at('receipts')}>Receipts and trace</ArrowLink>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

/** Readouts that sit in the scene; DominoScene positions them every frame. */
function Readouts({ data, huds }: { data: StoryData; huds: RefObject<Record<string, HTMLElement | null>> }) {
  const hud = (key: string) => (el: HTMLElement | null) => {
    huds.current[key] = el
  }
  const a = data.assumption
  const x = data.experiment
  const br = data.breaks >= 0 ? data.path[data.breaks] : null
  return (
    <div className="story-labels">
      {a && (
        <div className="hud hud-rel" ref={hud('rel')}>
          {relationText(a.relation)} · {a.status}
        </div>
      )}
      {data.runs.slice(0, 4).map((r, i) => (
        <div key={r.id} className={`hud hud-col${r.outcome !== 'pass' ? ' is-fail' : ''}`} ref={hud(`col-${i}`)}>
          {r.value == null ? '—' : String(r.value)}
        </div>
      ))}
      {x?.limit?.value != null && (
        <div className="hud hud-limit" ref={hud('limit')}>
          limit {x.limit.value}
        </div>
      )}
      {br && x?.candidateFailed && (
        <div className="hud hud-fail" ref={hud('fail')}>
          <span>{shortName(br)}</span> failed with the change
        </div>
      )}
    </div>
  )
}

/** Fallback without WebGL: the assembled object, held still in CSS. */
function StillStage() {
  return (
    <div className="story-still">
      <span className="still-plinth" />
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className={`still-tile${i === 0 ? ' is-change' : ''}`} style={{ ['--i' as string]: i }} />
      ))}
    </div>
  )
}

function RunStamp({ show, placeholder }: { show: Showcase; placeholder: boolean }) {
  const calls = show.inv.receipts.length
  const nemotron = show.inv.receipts.filter((r) => r.routedModel && isNemotron(r.routedModel)).length
  return (
    <p className="story-stamp">
      {placeholder ? 'Placeholder run, not a Domino result' : 'Saved practice run'} ·{' '}
      <a href={href.case(show.caseEntry.id)}>{show.caseEntry.id}</a>
      {!placeholder && (
        <>
          {' '}
          · shown from its recorded trace · {nemotron}/{calls} Nemotron calls
        </>
      )}
    </p>
  )
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function hasWebGL() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}

function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

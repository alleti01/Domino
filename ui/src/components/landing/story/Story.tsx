import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { HEADLINE, HERO_SUB } from '../../../content'
import { VERDICT } from '../../../lib/labels'
import { href } from '../../../lib/router'
import type { Showcase } from '../../../lib/showcase'
import { Arrow, ArrowLink } from '../Motion'
import { JUDGE_RULE, heldState, measureLabel, relationText, runTime, shortName, storyData, type StoryData } from './storyData'

const DominoScene = lazy(() => import('./DominoScene'))

const RUN_LABEL: Record<string, [string, string]> = {
  baseline: ['Baseline', 'without the change'],
  candidate: ['Candidate', 'with the change'],
  control: ['Control', 'change undone'],
}

/**
 * The opening of the landing page: one object, one investigation, five frames.
 * Each chapter pins a short message around the scene while the scene holds
 * that chapter's state; the detail lives in the linked report. All text is
 * ordinary HTML; without WebGL (or if the scene fails to start) a still
 * composition stands in.
 */
export function Story({ show }: { show: Showcase | null }) {
  const data = useMemo(() => (show ? storyData(show) : null), [show])
  const section = useRef<HTMLElement>(null)
  const progress = useRef(0)
  const huds = useRef<Record<string, HTMLElement | null>>({})
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  // Below 900px, or in portrait, the copy scrolls beneath the pinned object instead of being framed around it.
  const compact = useMediaQuery('(max-width: 900px), (max-aspect-ratio: 1/1)')
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
      // Lists that follow the scene: sources mark as they connect, runs as they play. Both stay readable throughout.
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
              <DominoScene
                data={data}
                progress={progress}
                huds={huds}
                reduced={reduced}
                compact={compact}
                active={active}
              />
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
                  See an example investigation
                  <Arrow />
                </a>
                <a className="story-secondary" href={href.cases}>
                  Browse all cases
                </a>
              </div>
              <p className="hero-disclosure">The example is a recorded practice run on a synthetic system.</p>
            </div>
            <p className="story-scroll" aria-hidden="true">
              Scroll to follow it
            </p>
          </div>
        </section>

        {data ? <Chapters data={data} reportHref={reportHref} /> : <p className="chapter-empty">The investigation appears here once a run is saved.</p>}
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

  return (
    <>
      {/* 1 · Heading above the object, one sentence and the sources below. */}
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
          <div className="chapter-body">
            <p className="chapter-text">
              Before judging change {change.label}, Domino gathers what is known about it — code, permissions, configuration and
              data — from separate systems, joined through the Zetaris semantic layer.
            </p>
            <ul className="connect-sources" aria-label="Systems joined in this example">
              {data.sources.map((s) => (
                <li key={s} data-source>
                  {s.replace(/_/g, ' ')}
                </li>
              ))}
            </ul>
            <ArrowLink className="chapter-link" href={at('chain')}>
              See the connected evidence
            </ArrowLink>
          </div>
        </div>
      </section>

      {/* 2 · The relationship in close-up, the explanation beside it. */}
      <section id="assumption" className="chapter chapter-assumption" data-chapter="2" aria-labelledby="ch-assumption">
        <div className="chapter-frame">
          <div className="chapter-body">
            <p className="chapter-kicker">
              <span>02</span> Find the assumption
            </p>
            <h2 id="ch-assumption" className="chapter-title">
              A link nobody <em>wrote down.</em>
            </h2>
            {a ? (
              <>
                <p className="chapter-text">
                  Most links came straight from records. This one, {shortName(data.path[a.from]).toLowerCase()}{' '}
                  {relationText(a.relation)} {shortName(data.path[a.to]).toLowerCase()}, was only inferred. That makes it a
                  hypothesis to test, not a fact.
                </p>
                <p className="assumption-question">
                  After change {change.label}, does {shortName(data.path[a.from]).toLowerCase()} stay within{' '}
                  {shortName(data.path[a.to]).toLowerCase()}?
                </p>
              </>
            ) : (
              <p className="chapter-text">Every link on this path came from a record, so the test targets the end of the path.</p>
            )}
            <ArrowLink className="chapter-link" href={at('hypotheses')}>
              See the hypotheses
            </ArrowLink>
          </div>
        </div>
      </section>

      {/* 3 · Heading above, the controlled comparison below. */}
      <section id="experiment" className="chapter chapter-experiment" data-chapter="3" aria-labelledby="ch-experiment">
        <div className="chapter-frame">
          <header className="chapter-head">
            <p className="chapter-kicker">
              <span>03</span> Test it and revert it
            </p>
            <h2 id="ch-experiment" className="chapter-title">
              Run it. <em>Then undo it.</em>
            </h2>
            <p className="chapter-text">
              The same workload runs in an isolated sandbox three ways. Only the change differs, so if the failure leaves when the
              change does, the change caused it.
            </p>
          </header>
          {x && (
            <div className="chapter-body">
              <ol className="run-strip" aria-label={`${measureLabel(x.key)}${x.limit?.value != null ? `, limit ${x.limit.value}` : ''}`}>
                {data.trio.map((r) => {
                  const [name, note] = RUN_LABEL[r.variant] ?? [r.variant, '']
                  return (
                    <li key={r.id} data-run className={r.outcome === 'pass' ? 'pass' : 'fail'}>
                      <span className="run-name">{name}</span>
                      <span className="run-note">{note}</span>
                      <span className="run-value">{r.value == null ? '—' : String(r.value)}</span>
                      <span className="run-outcome">{r.outcome === 'pass' ? 'Passed' : 'Failed'}</span>
                    </li>
                  )
                })}
              </ol>
              <p className="run-caption">
                {measureLabel(x.key)}
                {x.limit?.value != null && <> · limit {x.limit.value}</>}
              </p>
              <ArrowLink className="chapter-link" href={at('experiments')}>
                See every run, with logs
              </ArrowLink>
            </div>
          )}
        </div>
      </section>

      {/* 4 · The object settles; the verdict and the way into the report below it. */}
      <section id="result" className="chapter chapter-result" data-chapter="4" aria-labelledby="ch-result">
        <div className="chapter-frame">
          <div className="chapter-body">
            <p className="chapter-kicker">
              <span>04</span> Inspect the result
            </p>
            <h2 id="ch-result" className="chapter-title">
              Code decides <em>the verdict.</em>
            </h2>
            {data.verdict && v ? (
              <>
                <p className={`result-verdict tone-${v.tone}`}>{v.label}</p>
                <p className="chapter-text">
                  Domino's deterministic judge decided it from the runs, not the model. {JUDGE_RULE[data.verdict.verdict]}
                </p>
              </>
            ) : (
              <p className="chapter-text">This run has no verdict yet.</p>
            )}
            <a className="btn-chamfer" href={reportHref}>
              Open the full investigation
              <Arrow />
            </a>
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
          inferred
        </div>
      )}
      {data.trio.map((r, i) => (
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

// How Domino handles a change, in three steps. The heading and tabs stay pinned,
// the coloured panel on the left stays put and cross-fades to each step's card,
// and the copy on the right scrolls past; the tab follows whichever block is in
// the middle of the screen. Every card is drawn from the featured run.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { href } from '../../../lib/router'
import { chainTiles, experimentSummary, type Showcase } from '../../../lib/showcase'
import { modelName } from './data'
import { cap, plainComponent, plainFailure, plainSource, plainTitle, plainUnit } from './plain'

interface Step {
  key: string
  tab: string
  icon: ReactNode
  tag: string
  title: [string, string]
  body: string
  tone: string
  card: ReactNode
}

const Icon = ({ d }: { d: string }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// Each step has its own picture, built from the featured run, that says the
// step's one point at a glance.

/** The parts of the pipeline the change reaches, in order, without the change itself. */
function parts(show: Showcase) {
  return chainTiles(show.inv)
    .filter((t) => t.kind !== 'change')
    .map((t) => ({ id: t.id, name: plainComponent(t.kind, t.label), source: t.sources[0] ?? '' }))
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null)

const Check = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// 1 · The change, then every part of the pipeline it reaches, down to the limit.
function ConnectCard({ show }: { show: Showcase }) {
  const list = parts(show)
  const systems = new Set(list.map((p) => p.source).filter(Boolean)).size
  const lim = experimentSummary(show.inv)?.limit?.value
  return (
    <div className="sx">
      <header className="sx-head">
        <span className="sx-k">The change</span>
        <p className="sx-title">{plainTitle(show.inv.change?.title)}</p>
      </header>
      <ol className="sx-rail">
        {list.map((p, i) => {
          const end = i === list.length - 1
          return (
            <li key={p.id} className={end ? 'is-end' : undefined} style={{ '--i': i } as CSSProperties}>
              <span className="sx-name">{p.name}</span>
              <span className="sx-meta">{end && lim != null ? `limit ${lim}` : p.source ? plainSource(p.source) : ''}</span>
            </li>
          )
        })}
      </ol>
      <footer className="sx-foot">
        Reaches {list.length} parts across {systems} systems
      </footer>
    </div>
  )
}

// 2 · Two copies of the same pipeline, without and with the change.
function TestCard({ show }: { show: Showcase }) {
  const x = experimentSummary(show.inv)
  const list = parts(show).slice(0, -1)
  const runs = show.inv.experiments.filter((e) => e.completed)
  const base = runs.find((r) => r.variant === 'baseline')
  const cand = runs.find((r) => r.variant === 'candidate')
  const broke = cand?.assertions.find((a) => !a.passed)?.name
  const failAt = cand?.outcome === 'fail' ? list.length - 1 : -1
  const lanes = [
    { key: 'a', title: 'Without the change', value: num(x?.baseline), ok: base?.outcome !== 'fail' },
    { key: 'b', title: 'With the change', value: num(x?.candidate), ok: cand?.outcome !== 'fail' },
  ]
  return (
    <div className="sx">
      <header className="sx-head">
        <span className="sx-k">Two throwaway copies</span>
        <p className="sx-title">Same pipeline, run twice. Nothing real is touched.</p>
      </header>
      <div className="sx-cols">
        {lanes.map((l) => (
          <div key={l.key} className={`sx-col${l.ok ? '' : ' is-bad'}`}>
            <p className="sx-col-h">{l.title}</p>
            <p className="sx-num">
              {l.value ?? 'n/a'}
              <small>{x ? plainUnit(x.key) : ''}</small>
            </p>
            <ol className="sx-rail is-mini">
              {list.map((p, i) => (
                <li key={p.id} className={!l.ok && i === failAt ? 'is-end' : undefined} style={{ '--i': i } as CSSProperties}>
                  <span className="sx-name">{p.name}</span>
                </li>
              ))}
            </ol>
            <p className={`sx-status${l.ok ? ' is-ok' : ' is-bad'}`}>
              <i aria-hidden="true" />
              {l.ok ? 'Works' : broke ? cap(plainFailure(broke)) : 'Breaks'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// 3 · One answer, how far it went, and why you can trust it.
function DecideCard({ show }: { show: Showcase }) {
  const inv = show.inv
  const x = experimentSummary(inv)
  const failed = inv.verdict?.verdict === 'reproduced_failure'
  const b = num(x?.baseline)
  const c = num(x?.candidate)
  const lim = x?.limit?.value ?? null
  const top = Math.max(b ?? 0, c ?? 0, lim ?? 0) * 1.1 || 1
  const pct = (v: number) => `${(v / top) * 100}%`
  const verdicts = show.caseEntry.runs.map((r) => r.verdict).filter(Boolean)
  const agree = verdicts.filter((v) => v === inv.verdict?.verdict).length
  const reviewer = modelName(inv.review?.reviewerModel ?? null)
  return (
    <div className={`sx${failed ? ' is-bad' : ''}`}>
      <header className="sx-head">
        <span className="sx-k">The answer</span>
        <p className="sx-verdict">
          <i aria-hidden="true" />
          {failed ? 'This change would break your app' : 'No break found with this change'}
        </p>
      </header>
      {x && b != null && c != null && (
        <div className="sx-bars" style={{ '--lim': lim != null ? pct(lim) : '200%' } as CSSProperties}>
          <p className="sx-bars-h">
            {cap(plainUnit(x.key))}
            {lim != null && <span>limit {lim}</span>}
          </p>
          {[
            ['Before', b, false],
            ['With the change', c, failed],
          ].map(([name, v, bad], i) => (
            <div key={String(name)} className={`sx-bar${bad ? ' is-bad' : ''}`} style={{ '--i': i } as CSSProperties}>
              <span>{String(name)}</span>
              <span className="sx-track">
                <i style={{ '--w': pct(v as number) } as CSSProperties} />
              </span>
              <b>{String(v)}</b>
            </div>
          ))}
        </div>
      )}
      <ul className="sx-checks">
        {verdicts.length > 1 && (
          <li>
            <Check /> Same answer on every run <span>{agree} of {verdicts.length}</span>
          </li>
        )}
        <li>
          <Check /> Decided by code, not an AI guess
        </li>
        {inv.review?.outcome === 'approved' && reviewer && (
          <li>
            <Check /> Double-checked <span>{reviewer}</span>
          </li>
        )}
      </ul>
    </div>
  )
}

export function Steps({ show }: { show: Showcase }) {
  const steps: Step[] = [
    {
      key: 'connect',
      tab: 'Connect',
      icon: <Icon d="M3 8h3m4 0h3M6 8a2 2 0 1 0 4 0 2 2 0 1 0-4 0M3 4v8M13 4v8" />,
      tag: 'Your whole pipeline',
      title: ['Find everything', 'the change touches'],
      body: 'One change can reach your database, your services and your settings. Domino maps all of it.',
      tone: 'a',
      card: <ConnectCard show={show} />,
    },
    {
      key: 'test',
      tab: 'Test',
      icon: <Icon d="M6 2h4M7 2v4L3.5 12.5A1.5 1.5 0 0 0 4.8 14.5h6.4a1.5 1.5 0 0 0 1.3-2L9 6V2" />,
      tag: 'Tested in isolation',
      title: ['Run the change', 'in a copy'],
      body: 'Domino runs your pipeline without the change, then with it. Nothing real is touched.',
      tone: 'b',
      card: <TestCard show={show} />,
    },
    {
      key: 'decide',
      tab: 'Decide',
      icon: <Icon d="M3 8.5 6.5 12 13 4.5" />,
      tag: 'A clear answer',
      title: ['Know before', 'you ship'],
      body: 'Code compares the runs and tells you what broke, with the proof.',
      tone: 'c',
      card: <DecideCard show={show} />,
    },
  ]

  const [at, setAt] = useState(0)
  const blocks = useRef<(HTMLDivElement | null)[]>([])
  const head = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLElement>(null)

  // The block nearest the middle of the screen is the active step.
  useEffect(() => {
    const els = blocks.current.filter(Boolean) as HTMLDivElement[]
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setAt(Number((e.target as HTMLElement).dataset.i))
      },
      { rootMargin: '-48% 0px -48% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // The pinned panel sits under the pinned heading, whatever its height.
  useEffect(() => {
    const h = head.current
    const r = root.current
    if (!h || !r) return
    const ro = new ResizeObserver(() => r.style.setProperty('--j-head', `${h.offsetHeight}px`))
    ro.observe(h)
    return () => ro.disconnect()
  }, [])

  const go = (i: number) => {
    const el = blocks.current[i]
    if (!el) return
    const y = el.getBoundingClientRect().top + scrollY - (innerHeight - el.offsetHeight) / 2
    scrollTo({ top: y, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  return (
    <section ref={root} id="steps" className="j-section" aria-labelledby="steps-title">
      <div className="g-wrap">
        <div ref={head} className="j-head">
          <p className="j-kicker">
            <span>[01]</span> How Domino works
          </p>
          <h2 id="steps-title" className="j-h2">
            One change, tested against everything
          </h2>
          <div className="j-tabs" role="tablist" aria-label="Steps">
            {steps.map((s, i) => (
              <button key={s.key} type="button" role="tab" aria-selected={i === at} className={i === at ? 'is-on' : undefined} onClick={() => go(i)}>
                {s.icon}
                {s.tab}
              </button>
            ))}
            <span className="j-hatch" aria-hidden="true" />
          </div>
        </div>
        <div className="j-body">
          <div className="j-visual" data-tone={steps[at].tone} aria-hidden="true">
            {steps.map((s, i) => (
              <div key={s.key} className={`j-stage${i === at ? ' is-on' : ''}`} style={{ '--k': i - at } as CSSProperties}>
                {s.card}
              </div>
            ))}
          </div>
          <div className="j-copy">
            {steps.map((s, i) => (
              <div
                key={s.key}
                ref={(el) => {
                  blocks.current[i] = el
                }}
                data-i={i}
                className="j-block"
              >
                <div className="j-inline" data-tone={s.tone} aria-hidden="true">
                  {s.card}
                </div>
                <span className="j-tag">{s.tag}</span>
                <h3>
                  {s.title[0]}
                  <br />
                  {s.title[1]}
                </h3>
                <p>{s.body}</p>
                <div className="j-actions">
                  <a className="g-btn g-btn-accent" href={href.case(show.caseEntry.id)}>
                    Open this investigation
                  </a>
                  <a className="g-btn g-btn-ghost" href={href.cases}>
                    All cases
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

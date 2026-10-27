import { useMemo, useState, type CSSProperties } from 'react'
import { REPO_URL } from '../../../config'
import type { SiteData } from '../../../types'
import { href } from '../../../lib/router'
import { caseCards, featured, loopData, type CaseCard } from './data'
import { Cases } from './Cases'
import { Hero } from './Device'
import { Reveal } from './Reveal'
import { Loop } from './Loop'
import { Machine } from './Machine'

/* ---------- Shared bits ---------- */

/* ---------- Marquee ---------- */

const BUILT = [
  ['Zetaris', 'semantic layer'],
  ['NVIDIA Nemotron', 'investigator'],
  ['Meterless Nightshift', 'model routing'],
  ['Nemotron Ultra', 'reviewer'],
  ['Meterless World Model', 'memory'],
]

function Marquee() {
  const row = [...BUILT, ...BUILT]
  return (
    <div className="g-marquee" aria-label="Built on Zetaris, NVIDIA Nemotron and Meterless">
      <div className="g-marquee-track" aria-hidden="true">
        {row.map(([name, role], i) => (
          <span key={i}>
            {name}
            <small>{role}</small>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------- Case study ---------- */

function Story({ site }: { site: SiteData }) {
  const show = featured(site.cases)
  const card = show ? caseCards(site.cases).find((c) => c.id === show.caseEntry.id) : null
  if (!show || !card) return null
  const v = show.inv.verdict
  const quote = (v?.cause ?? v?.headline ?? '').split(/(?<=[.!?])\s/).slice(0, 2).join(' ')
  const num = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : null)
  const b = num(card.baseline)
  const cand = num(card.candidate)
  const max = Math.max(b ?? 0, cand ?? 0, card.limit ?? 0) * 1.15 || 1
  const w = (x: number | null) => `${((x ?? 0) / max) * 100}%`
  const failedCheck = show.inv.experiments.find((e) => e.variant === 'candidate' && e.outcome === 'fail')?.assertions.find((a) => !a.passed)?.name
  const reviewer = show.inv.review?.reviewerModel?.split('/').pop()

  return (
    <section className="g-story" aria-labelledby="story-title">
      <div className="g-story-copy">
        <p className="g-label">Case study</p>
        <h2 id="story-title" className="g-h2">
          {card.title}.
        </h2>
        {quote && <blockquote>“{quote}”</blockquote>}
        <p className="g-story-by">
          Domino’s explanation
          <span>{show.inv.review?.outcome === 'approved' && reviewer ? `Checked and approved by ${reviewer}` : 'Written by the investigator model'}</span>
        </p>
        <div className="g-story-result">
          <p>
            {show.caseEntry.label} result:
            <strong className="g-num">{card.runs > 1 ? `${card.agreeing}/${card.runs}` : card.verdictLabel === 'Reproduced failure' ? 'Failed' : 'Passed'}</strong>
            {card.runs > 1 ? 'runs reached the same verdict' : card.verdictLabel.toLowerCase()}
          </p>
          <a className="g-btn g-btn-ghost" href={href.case(card.id)}>
            Read the investigation
          </a>
        </div>
      </div>
      <div className="g-story-visual" aria-hidden="true">
        <div className="g-meter-tag">
          {failedCheck && <span>Candidate · failed {failedCheck}</span>}
          {card.limit != null && <span>Limit · {card.limit}</span>}
          <span>{card.measure}</span>
        </div>
        <div className="g-meter">
          {[
            ['Baseline', b, false],
            ['Candidate', cand, card.failed],
            ['Control', b, false],
          ].map(([name, val, bad]) => (
            <div key={String(name)} className="g-meter-row">
              <span className="g-mono">{String(name)}</span>
              <span className="g-meter-bar">
                <i className={bad ? 'is-fail' : undefined} style={{ '--w': w(val as number | null) } as CSSProperties} />
                {card.limit != null && <span className="g-meter-limit" style={{ '--x': w(card.limit) } as CSSProperties} />}
              </span>
              <span className={`g-pixel g-num${bad ? ' g-fail' : ''}`} style={{ fontSize: 22 }}>
                {val == null ? 'n/a' : String(val)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- Closing ---------- */

function Closing({ cards }: { cards: CaseCard[] }) {
  const [id, setId] = useState(cards[0]?.id ?? '')
  return (
    <section className="g-cta" aria-labelledby="cta-title">
      <div className="g-wrap">
        <Reveal>
          <p className="g-label">Before you deploy</p>
          <h2 id="cta-title" className="g-h2">
            See what Domino would catch
            <br />
            in your change.
          </h2>
          <p className="g-lead">Every verdict comes with the rows it cites, the runs it compared and the model calls behind it.</p>
          <form
            className="g-cta-field"
            onSubmit={(e) => {
              e.preventDefault()
              window.location.hash = (id ? href.case(id) : href.cases).replace(/^#/, '')
            }}
          >
            <label className="visually-hidden" htmlFor="cta-case">
              Recorded change
            </label>
            <select id="cta-case" value={id} onChange={(e) => setId(e.target.value)}>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} · {c.id}
                </option>
              ))}
            </select>
            <button type="submit" className="g-btn g-btn-accent">
              Show me
            </button>
          </form>
          <p className="g-cta-fine">
            Recorded runs on synthetic systems. The code is on{' '}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub<span className="visually-hidden"> (opens in a new tab)</span>
            </a>
            .
          </p>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------- Page ---------- */

export function Landing({ site }: { site: SiteData | null }) {
  const cards = useMemo(() => (site ? caseCards(site.cases) : []), [site])
  const show = site ? featured(site.cases) : null
  return (
    <>
      <Hero cards={cards} />
      <Marquee />
      <Cases cards={cards} />
      {show && <Machine inv={show.inv} caseId={show.caseEntry.id} />}
      {site && <Loop data={loopData(site)} cards={cards} />}
      {site && <Story site={site} />}
      <Closing cards={cards} />
    </>
  )
}

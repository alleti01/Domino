import { useEffect } from 'react'
import type { SiteData } from '../../types'
import type { SiteState } from '../../data/useSite'
import { DEMO_VIDEO_URL } from '../../config'
import { INCIDENTS, ONE_LINER, PITCH, RUN_LOCALLY, STEPS } from '../../content'
import { CASE_KIND, VERDICT, isNemotron } from '../../lib/labels'
import { href } from '../../lib/router'
import { plural, summarizeRuns } from '../../lib/runs'
import { scrollToSection } from '../../lib/scroll'
import { Badge, CommandBlock } from '../common'
import { Icon } from '../Icon'
import { HeroPreview } from './HeroPreview'

export function LandingPage({ state, section }: { state: SiteState; section: string | null }) {
  // ?section=how (from the nav) scrolls to that part of the page.
  useEffect(() => {
    if (section) scrollToSection(section)
  }, [section])

  const site = state.status === 'ready' ? state.site : null

  return (
    <div className="landing">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="page-kicker">Pre-deployment failure investigation</p>
          <h1 id="hero-title">{ONE_LINER}</h1>
          <p className="hero-lede">{PITCH}</p>
          <div className="hero-actions">
            <a className="button button-primary button-large" href={href.try}>
              Try it yourself
            </a>
            <a className="button button-large" href={href.landing('demo')}>
              Watch demo
            </a>
          </div>
          <p className="small muted">
            No sign-up and no keys. Or <a href={href.cases}>open the dashboard</a>.
          </p>
        </div>
        <div className="hero-visual">
          <HeroPreview state={state} />
        </div>
      </section>

      <section id="problem" className="landing-section" aria-labelledby="problem-title" tabIndex={-1}>
        <h2 id="problem-title">Outages start in the system nobody thought to test.</h2>
        <p className="landing-lede">
          Teams test the file they changed. Two of the biggest outages of recent years came from changes that were
          fine on their own and broke something further down the line.
        </p>
        <ul className="incident-list">
          {INCIDENTS.map((i) => (
            <li key={i.name} className="incident">
              <h3>{i.name}</h3>
              <p>{i.mechanism}</p>
              <a className="small" href={i.source} target="_blank" rel="noreferrer">
                Read the postmortem<span className="visually-hidden"> for {i.name} (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="small muted">
          Domino recreates these mechanisms in small, isolated simulations. They are real public incidents, not results we
          claim credit for.
        </p>
      </section>

      <section id="how" className="landing-section" aria-labelledby="how-title" tabIndex={-1}>
        <h2 id="how-title">How it works</h2>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.key} className="step">
              <span className="step-num" aria-hidden="true">
                {i + 1}
              </span>
              <div className="step-body">
                <h3>
                  <Icon name={s.icon} size={16} /> {s.title}
                </h3>
                <p>{s.text}</p>
                <span className="step-tech">{s.tech}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="cases" className="landing-section" aria-labelledby="cases-title" tabIndex={-1}>
        <h2 id="cases-title">One engine, different failures</h2>
        <p className="landing-lede">
          Every case runs through the same investigation. A safe change is included to check Domino doesn't raise a
          false alarm.
        </p>
        {site ? <CaseCards site={site} /> : <p className="muted">Loading cases…</p>}
      </section>

      <section id="proof" className="landing-section" aria-labelledby="proof-title" tabIndex={-1}>
        <h2 id="proof-title">Every claim links to its proof</h2>
        {site ? <ProofStrip site={site} /> : <p className="muted">Loading…</p>}
        <p className="hero-actions">
          <a className="button" href={href.results}>
            Results and scorecard
          </a>
          <a className="button" href={href.underTheHood}>
            Under the hood: Zetaris, Meterless, Nemotron
          </a>
        </p>
      </section>

      <section id="demo" className="landing-section" aria-labelledby="demo-title" tabIndex={-1}>
        <h2 id="demo-title">Watch the demo</h2>
        {DEMO_VIDEO_URL ? (
          <p>
            <a className="button button-primary button-large" href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer">
              Watch the demo video<span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </p>
        ) : (
          <div className="demo-placeholder">
            <Icon name="clock" size={24} />
            <p>
              The demo video is recorded from a real run and will appear here. Until then, try it yourself: it replays a
              saved investigation step by step.
            </p>
          </div>
        )}
      </section>

      <section id="start" className="landing-section landing-cta" aria-labelledby="start-title" tabIndex={-1}>
        <h2 id="start-title">See Domino investigate a change.</h2>
        <p className="landing-lede">Pick a pull request, run Domino, and watch it find what breaks. No keys needed.</p>
        <p>
          <a className="button button-primary button-large" href={href.try}>
            Try it yourself
          </a>
        </p>
        <details className="run-locally">
          <summary>Prefer your own machine? Run it locally</summary>
          <CommandBlock lines={RUN_LOCALLY} />
        </details>
      </section>
    </div>
  )
}

function CaseCards({ site }: { site: SiteData }) {
  return (
    <ul className="case-cards">
      {site.cases.map((c) => {
        const latest = c.runs[0]
        const v = latest?.verdict ? VERDICT[latest.verdict] : null
        const sum = summarizeRuns(c)
        return (
          <li key={c.id} className="case-card">
            <h3>
              <a href={href.case(c.id)}>{c.label}</a>
            </h3>
            <p className="small muted">{CASE_KIND[c.kind]}</p>
            {v ? (
              <Badge tone={v.tone} icon={v.icon}>
                {v.label}
              </Badge>
            ) : (
              <Badge tone="muted" icon="clock">
                No verdict yet
              </Badge>
            )}
            <p className="small muted">{plural(sum.total, 'run')}</p>
          </li>
        )
      })}
    </ul>
  )
}

/** Numbers computed from the saved runs; nothing here is typed in by hand. */
function ProofStrip({ site }: { site: SiteData }) {
  const invs = site.cases.flatMap((c) => c.runs.flatMap((r) => (r.load.ok ? [r.load.investigation] : [])))
  const calls = invs.flatMap((i) => i.receipts)
  const nemotron = calls.filter((r) => r.routedModel && isNemotron(r.routedModel)).length
  const sources = new Set(invs.flatMap((i) => [...i.evidence.values()].filter((e) => e.kind === 'row').map((e) => e.source)))
  const judged = invs.filter((i) => i.verdict?.decidedBy === 'deterministic_judge').length
  const memory = invs.reduce((n, i) => n + i.memory.length, 0)

  const stats: [string, string][] = [
    [`${nemotron} / ${calls.length}`, 'model calls answered by NVIDIA Nemotron, via Meterless Nightshift'],
    [String(sources.size), 'independent data sources joined in the Zetaris semantic layer'],
    [`${judged} / ${invs.length}`, 'verdicts decided by a rule-based judge, not the model'],
    [String(memory), 'Meterless World Model reads and writes across runs'],
  ]
  return (
    <>
      {site.isPlaceholder && <p className="small muted">Computed from placeholder runs until real runs are saved.</p>}
      <ul className="tiles">
        {stats.map(([value, label]) => (
          <li key={label} className="tile">
            <span className="tile-value">{value}</span>
            <span className="tile-desc">{label}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

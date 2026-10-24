import type { SiteData } from '../types'
import { VERDICT_MEANING } from '../content'
import { CASE_KIND, VERDICT } from '../lib/labels'
import { href } from '../lib/router'
import { plural, summarizeRuns } from '../lib/runs'
import { Badge, PlaceholderNotice } from './common'

/** Dashboard home: every case, with links into its reports. */
export function CasesView({ site }: { site: SiteData }) {
  return (
    <article className="page" aria-labelledby="page-title">
      {site.isPlaceholder && <PlaceholderNotice />}
      <header className="page-head">
        <div className="page-kicker">Dashboard</div>
        <h1 id="page-title">Cases</h1>
        <p className="muted">
          The same engine runs every case: simulations of real incident mechanisms, a held-out case and a safe change.
          Open one to see the full investigation and its proof.
        </p>
      </header>

      <ul className="case-cards">
        {site.cases.map((c) => {
          const latest = c.runs[0]
          const v = latest?.verdict ? VERDICT[latest.verdict] : null
          const sum = summarizeRuns(c)
          return (
            <li key={c.id} className="case-card">
              <h2>
                <a href={href.case(c.id)}>{c.label}</a>
              </h2>
              <p className="small muted">{CASE_KIND[c.kind]}</p>
              {c.description && <p className="small">{c.description}</p>}
              {v ? (
                <Badge tone={v.tone} icon={v.icon}>
                  {v.label}
                </Badge>
              ) : (
                <Badge tone="muted" icon="clock">
                  {latest?.status === 'running' ? 'Running' : 'No verdict yet'}
                </Badge>
              )}
              <p className="small muted">
                {plural(sum.total, 'Domino run')}
                {sum.decided > 0 && sum.matching != null && ` · ${sum.matching} of ${sum.decided} match the expected verdict`}
                {sum.ablations > 0 && ` · ${plural(sum.ablations, 'comparison run')}`}
              </p>
              <p className="small case-card-links">
                <a href={href.case(c.id)}>
                  Report<span className="visually-hidden"> for {c.label}</span>
                </a>
                <a href={href.case(c.id, { view: 'pr' })}>
                  PR view<span className="visually-hidden"> for {c.label}</span>
                </a>
              </p>
            </li>
          )
        })}
      </ul>

      <section className="section" aria-labelledby="verdicts-title">
        <h2 id="verdicts-title">What the verdicts mean</h2>
        <dl className="verdict-legend">
          {VERDICT_MEANING.map(([key, meaning]) => {
            const v = VERDICT[key]
            return (
              <div key={key}>
                <dt>
                  <Badge tone={v.tone} icon={v.icon}>
                    {v.label}
                  </Badge>
                </dt>
                <dd>{meaning}</dd>
              </div>
            )
          })}
        </dl>
      </section>

      <section className="section" aria-labelledby="more-title">
        <h2 id="more-title">Across all cases</h2>
        <p className="hero-actions">
          <a className="button" href={href.results}>
            Results and scorecard
          </a>
          <a className="button" href={href.underTheHood}>
            Under the hood: sponsor proof
          </a>
        </p>
      </section>
    </article>
  )
}

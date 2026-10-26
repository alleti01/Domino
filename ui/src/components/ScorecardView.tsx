import { useEffect, type ReactNode } from 'react'
import type { CaseEntry, Scorecard, Verdict } from '../types'
import { RUN_MODE, VERDICT } from '../lib/labels'
import { href } from '../lib/router'
import { plural } from '../lib/runs'
import { scrollToSection } from '../lib/scroll'
import { Breadcrumbs, PlaceholderNotice, VerdictMark } from './common'
import { Icon } from './Icon'

/** Verdicts from saved full-comparison runs; outages are excluded rather than counted as answers. */
function recordedVerdicts(c: CaseEntry, scorecard: Scorecard): Verdict[] {
  const row = scorecard.cases.find((r) => r.caseId === c.id)
  if (row && row.verdicts.length > 0) return row.verdicts
  return c.runs.filter((r) => r.runMode === 'full' && r.status !== 'outage' && r.verdict).map((r) => r.verdict as Verdict)
}

function GroupHead({ id, kicker, title, children }: { id: string; kicker: string; title: string; children: ReactNode }) {
  return (
    <div className="group-head">
      <p className="group-kicker">{kicker}</p>
      <h2 id={id} className="block-title">
        {title}
      </h2>
      <p className="block-lede">{children}</p>
    </div>
  )
}

/**
 * Results across cases, in four kinds that must not blur: what the saved runs
 * recorded, what the case authors published as expected, what the scorecard
 * measured, and comparisons that have not been measured yet.
 */
export function ScorecardView({ scorecard, cases, section }: { scorecard: Scorecard; cases: CaseEntry[]; section?: string | null }) {
  useEffect(() => {
    if (section) scrollToSection(section)
  }, [section])

  const published = cases.filter((c) => (scorecard.cases.find((r) => r.caseId === c.id)?.expected ?? c.expectedVerdict) != null)
  const measured = scorecard.metrics.filter((m) => m.display != null)

  return (
    <article className="page" aria-labelledby="page-title">
      {scorecard.isPlaceholder && <PlaceholderNotice />}
      <header className="page-head">
        <Breadcrumbs items={[{ label: 'Investigations', href: href.cases }, { label: 'Results' }]} />
        <h1 id="page-title">Results</h1>
        <p className="page-lede">
          What the saved runs recorded, kept apart from expected answers, measured metrics and comparisons still to be
          run. {plural(cases.length, 'case')} loaded: read them as individual results, not a benchmark.
        </p>
      </header>

      <section className="results-group" id="outcomes" aria-labelledby="outcomes-title">
        <GroupHead id="outcomes-title" kicker="Recorded" title="Recorded outcomes">
          The verdict each saved run reached. Every icon opens that run.
        </GroupHead>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Recorded outcomes">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Case</th>
                <th scope="col">Latest recorded verdict</th>
                <th scope="col">Every run, newest first</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const latest = c.runs[0]
                return (
                  <tr key={c.id}>
                    <th scope="row">
                      <a href={href.case(c.id)}>{c.label}</a>
                      <span className="cell-sub">
                        <code>{c.id}</code>
                      </span>
                    </th>
                    <td>
                      {latest?.verdict ? (
                        <VerdictMark verdict={latest.verdict} />
                      ) : (
                        <span className="muted">{latest ? 'No verdict in the saved trace' : 'No runs'}</span>
                      )}
                    </td>
                    <td>
                      <ul className="run-dots">
                        {c.runs.map((r, i) => {
                          const v = r.verdict ? VERDICT[r.verdict] : null
                          const label = `${r.runId}: ${v ? v.label : 'no verdict'}${r.runMode !== 'full' ? ` (${RUN_MODE[r.runMode].label})` : ''}`
                          return (
                            <li key={r.runId}>
                              <a
                                href={href.case(c.id, { runId: i === 0 ? null : r.runId })}
                                className={`tone-text-${v ? v.tone : 'muted'}`}
                                title={label}
                              >
                                <Icon name={v ? v.icon : 'clock'} size={16} />
                                <span className="visually-hidden">{label}</span>
                              </a>
                            </li>
                          )
                        })}
                      </ul>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="results-group" id="expected" aria-labelledby="expected-title">
        <GroupHead id="expected-title" kicker="Published" title="Expected verdicts">
          The answer each case's author published, compared with the recorded full-comparison runs. Outages are left out
          rather than counted as wrong.
        </GroupHead>
        {published.length === 0 ? (
          <div className="pending-state">
            <strong>No expected verdicts published for these cases</strong>
            <span>Each case's expected answer appears here once its author publishes it.</span>
          </div>
        ) : (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Expected verdicts">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Case</th>
                  <th scope="col">Published expected verdict</th>
                  <th scope="col">Recorded runs that match</th>
                </tr>
              </thead>
              <tbody>
                {published.map((c) => {
                  const expected = (scorecard.cases.find((r) => r.caseId === c.id)?.expected ?? c.expectedVerdict) as Verdict
                  const done = recordedVerdicts(c, scorecard)
                  return (
                    <tr key={c.id}>
                      <th scope="row">
                        <a href={href.case(c.id)}>{c.label}</a>
                      </th>
                      <td>{VERDICT[expected].label}</td>
                      <td className="num">
                        {done.length === 0 ? '—' : `${done.filter((v) => v === expected).length} of ${done.length}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="results-group" id="metrics" aria-labelledby="metrics-title">
        <GroupHead id="metrics-title" kicker="Measured" title="Measured metrics">
          Figures from a scorecard run that measures every case with the same engine, each with its sample size.
          {scorecard.generatedAt && ` Generated ${scorecard.generatedAt}.`}
        </GroupHead>
        {measured.length === 0 ? (
          <div className="pending-state">
            <strong>Not measured yet</strong>
            <span>
              The scorecard hasn't been run on these cases. Its figures appear here when it has, and none are estimated in
              the meantime.
            </span>
          </div>
        ) : (
          <ul className="metric-grid">
            {scorecard.metrics.map((m) => (
              <li key={m.key}>
                <span className={`metric-value${m.display == null ? ' is-empty' : ''}`}>{m.display ?? '—'}</span>
                <span className="metric-label">{m.label}</span>
                <span className="metric-desc">
                  {m.display == null ? 'Not measured yet' : m.definition}
                  {m.n != null && ` · n = ${m.n}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="results-group" id="baselines" aria-labelledby="baselines-title">
        <GroupHead id="baselines-title" kicker="Comparison" title="Compared with simpler methods">
          The same cases through simpler approaches: static checks only, Nemotron alone, Nemotron with context but no
          experiments, and full Domino.
        </GroupHead>
        {scorecard.baselines.length === 0 ? (
          <div className="pending-state">
            <strong>Not measured yet</strong>
            <span>No baseline runs have been recorded, so there is no comparison to show.</span>
          </div>
        ) : (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Comparison with simpler methods">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Method</th>
                  {cases.map((c) => (
                    <th scope="col" key={c.id}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scorecard.baselines.map((b) => (
                  <tr key={b.key}>
                    <th scope="row">{b.label}</th>
                    {cases.map((c) => {
                      const v = b.perCase[c.id]
                      return <td key={c.id}>{v ? <VerdictMark verdict={v} /> : <span className="muted">Not run</span>}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </article>
  )
}

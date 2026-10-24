import type { CaseEntry, Scorecard, Verdict } from '../types'
import { VERDICT } from '../lib/labels'
import { href } from '../lib/router'
import { Badge, Breadcrumbs, PlaceholderNotice } from './common'
import { Icon } from './Icon'

function VerdictBadge({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) return <span className="muted">Not run</span>
  const v = VERDICT[verdict]
  return (
    <Badge tone={v.tone} icon={v.icon}>
      {v.label}
    </Badge>
  )
}

export function ScorecardView({ scorecard, cases }: { scorecard: Scorecard; cases: CaseEntry[] }) {
  return (
    <article className="page" aria-labelledby="page-title">
      {scorecard.isPlaceholder && <PlaceholderNotice />}
      <header className="page-head">
        <Breadcrumbs items={[{ label: 'Overview', href: href.cases }, { label: 'Results' }]} />
        <div className="page-kicker">Evaluation</div>
        <h1 id="page-title">Results</h1>
        <p className="muted">
          Measured across every case with the same engine.{' '}
          {scorecard.generatedAt ? `Generated ${scorecard.generatedAt}.` : 'No scorecard run yet.'}
        </p>
      </header>

      {scorecard.metrics.length > 0 && (
        <ul className="tiles">
          {scorecard.metrics.map((m) => (
            <li key={m.key} className="tile">
              <span className="tile-label">{m.label}</span>
              <span className={`tile-value${m.display == null ? ' empty' : ''}`}>{m.display ?? '—'}</span>
              <span className="tile-desc">
                {m.display == null ? 'Not yet measured' : m.definition}
                {m.n != null && ` · n = ${m.n}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <section className="section" aria-labelledby="cases-title">
        <h2 id="cases-title">Results by case</h2>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Results by case">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Case</th>
                <th scope="col">Expected</th>
                <th scope="col">Latest Domino verdict</th>
                <th scope="col">Runs matching expected</th>
                <th scope="col">Every run</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                // Prefer the scorecard's measured runs; otherwise count saved full-mode runs (outages excluded).
                const row = scorecard.cases.find((r) => r.caseId === c.id)
                const expected = row?.expected ?? c.expectedVerdict
                const verdicts =
                  row && row.verdicts.length > 0
                    ? row.verdicts
                    : c.runs.filter((r) => r.runMode === 'full' && r.status !== 'outage').map((r) => r.verdict)
                const done = verdicts.filter((v): v is Verdict => v != null)
                const matching = done.filter((v) => v === expected).length
                return (
                  <tr key={c.id}>
                    <th scope="row">
                      <a href={href.case(c.id)}>{c.label}</a>
                    </th>
                    <td>{expected ? VERDICT[expected].label : <span className="muted">Not published</span>}</td>
                    <td>
                      <VerdictBadge verdict={c.runs[0]?.verdict ?? null} />
                    </td>
                    <td>{done.length === 0 || !expected ? '—' : `${matching} of ${done.length}`}</td>
                    <td>
                      <ul className="run-dots">
                        {c.runs.map((r, i) => {
                          const v = r.verdict ? VERDICT[r.verdict] : null
                          return (
                            <li key={r.runId}>
                              <a
                                href={href.case(c.id, { runId: i === 0 ? null : r.runId })}
                                className={`tone-text-${v ? v.tone : 'muted'}`}
                                title={`${r.runId}: ${v ? v.label : 'no verdict'}`}
                              >
                                <Icon name={v ? v.icon : 'clock'} size={16} />
                                <span className="visually-hidden">
                                  {r.runId}: {v ? v.label : 'no verdict'}
                                </span>
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

      <section className="section" aria-labelledby="baselines-title">
        <h2 id="baselines-title">Compared with simpler methods</h2>
        <p className="section-lede">
          The same cases run through simpler approaches, to show what Domino adds: static checks only, Nemotron
          alone, Nemotron with context but no experiments, and full Domino.
        </p>
        {scorecard.baselines.length === 0 ? (
          <p className="pending">Not measured yet. This fills in when the scorecard includes baseline runs.</p>
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
                    {cases.map((c) => (
                      <td key={c.id}>
                        <VerdictBadge verdict={b.perCase[c.id] ?? null} />
                      </td>
                    ))}
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

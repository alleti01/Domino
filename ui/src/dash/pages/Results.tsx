// Results: is Domino consistent, and how does it compare? The answer first,
// then every full run as one square in a change × repeat grid, then the graded
// benchmarks, which say plainly when they haven't been measured yet.

import { RUN_MODE, VERDICT } from '../../lib/labels'
import { href } from '../../lib/router'
import type { RunEntry, RunMode, SiteData } from '../../types'
import { agreement, changeTitle, isExample, latestInv, siteStats } from '../derive'
import { DIcon } from '../icons'
import { ExampleTag, PageHeader, Panel, Status, VERDICT_SHORT } from '../ui'

function cellTone(r: RunEntry | undefined) {
  if (!r) return 'empty'
  if (r.status === 'outage') return 'warn'
  if (!r.verdict) return 'muted'
  return VERDICT[r.verdict].tone
}

function cellLabel(r: RunEntry | undefined) {
  if (!r) return 'No run'
  if (r.status === 'outage') return 'Outage, excluded'
  return r.verdict ? VERDICT_SHORT[r.verdict] : 'No verdict'
}

export function Results({ site }: { site: SiteData }) {
  const s = siteStats(site)
  const sc = site.scorecard
  const repeats = Math.max(0, ...site.cases.map((c) => c.runs.filter((r) => r.runMode === 'full').length))
  const modes = [...new Set(site.cases.flatMap((c) => c.runs.map((r) => r.runMode)))] as RunMode[]
  const measured = sc?.metrics.filter((m) => m.display != null) ?? []
  const anyExpected = site.cases.some((c) => (sc?.cases.find((r) => r.caseId === c.id)?.expected ?? c.expectedVerdict) != null)
  const disagree = s.casesWithRepeats - s.consistentCases

  // Per mode: how often a run in that mode reached the same verdict as full Domino's majority.
  const byMode = modes
    .filter((m) => m !== 'full')
    .map((m) => {
      let n = 0
      let same = 0
      for (const c of site.cases) {
        const ref = agreement(c).majority
        for (const r of c.runs.filter((x) => x.runMode === m && x.verdict)) {
          n += 1
          if (ref && r.verdict === ref) same += 1
        }
      }
      return { mode: m, n, same }
    })

  return (
    <>
      <PageHeader
        title="Results"
        sub="What the saved runs recorded, kept apart from expected answers and from comparisons still to be measured. Read them as individual results on synthetic systems, not a benchmark."
        meta={site.cases.some((c) => isExample(c.kind)) ? <ExampleTag /> : undefined}
      />

      <div className="dx-stack">
        {/* The answer */}
        <section className="dx-answer">
          <div className="dx-answer-main">
            <div className="dx-answer-head">
              <span className={`dx-answer-icon tone-${disagree ? 'warn' : 'ok'}`}>
                <DIcon name={disagree ? 'alert' : 'check'} size={22} />
              </span>
              <div>
                <h2 className="dx-answer-headline">
                  {s.casesWithRepeats === 0
                    ? 'No change has been repeated yet'
                    : disagree === 0
                      ? `Every change got the same verdict on all ${repeats} repeats`
                      : `${disagree} of ${s.casesWithRepeats} changes got different verdicts across repeats`}
                </h2>
                <p className="dx-muted">
                  {s.fullRuns} full runs on {s.cases} changes{s.outages ? `, ${s.outages} lost to outages and left out` : ''}.{' '}
                  {measured.length ? 'Graded accuracy is below.' : 'Accuracy against the answer key appears once the graded scorecard is exported.'}
                </p>
              </div>
            </div>
            <dl className="dx-facts">
              <div>
                <dt>Repeats agree</dt>
                <dd>
                  {s.consistentCases} of {s.casesWithRepeats}
                </dd>
              </div>
              <div>
                <dt>Explanations approved</dt>
                <dd>
                  {s.approved} of {s.reviewed}
                </dd>
              </div>
              <div>
                <dt>Reproduced failure</dt>
                <dd>
                  <Status tone="fail">{s.runVerdicts.reproduced_failure} runs</Status>
                </dd>
              </div>
              <div>
                <dt>No failure observed</dt>
                <dd>
                  <Status tone="neutral">{s.runVerdicts.no_failure_observed} runs</Status>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Every full run, one square each */}
        <Panel title="Every run" desc={`${s.fullRuns} runs`} flush>
          <div className="dx-grid-wrap">
            <table className="dx-rgrid">
              <thead>
                <tr>
                  <th />
                  {anyExpected && <th>Expected</th>}
                  {Array.from({ length: repeats }, (_, i) => (
                    <th key={i}>Run {i + 1}</th>
                  ))}
                  <th>Agree</th>
                </tr>
              </thead>
              <tbody>
                {site.cases.map((c) => {
                  const full = c.runs.filter((r) => r.runMode === 'full').reverse()
                  const a = agreement(c)
                  const expected = sc?.cases.find((r) => r.caseId === c.id)?.expected ?? c.expectedVerdict
                  return (
                    <tr key={c.id}>
                      <th scope="row">
                        <a href={href.case(c.id)}>
                          <span className="dx-rgrid-title">{changeTitle(latestInv(c), c.label)}</span>
                          <span className="dx-faint">{c.label}</span>
                        </a>
                      </th>
                      {anyExpected && (
                        <td>
                          {expected ? <span className={`dx-rcell tone-${VERDICT[expected].tone} is-outline`} title={`Expected: ${VERDICT_SHORT[expected]}`} /> : null}
                        </td>
                      )}
                      {Array.from({ length: repeats }, (_, i) => {
                        const r = full[i]
                        return (
                          <td key={i}>
                            {r ? (
                              <a href={href.case(c.id, { runId: r.runId })} className={`dx-rcell tone-${cellTone(r)}`} title={`Run ${i + 1}: ${cellLabel(r)}`} aria-label={`Run ${i + 1}: ${cellLabel(r)}`} />
                            ) : (
                              <span className="dx-rcell tone-empty" title="No run" />
                            )}
                          </td>
                        )
                      })}
                      <td className={`dx-rgrid-agree${a.agreeing < a.decided ? ' is-warn' : ''}`}>{a.decided ? `${a.agreeing}/${a.decided}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="dx-rgrid-legend">
            <span>
              <i className="dx-rcell tone-fail" /> Reproduced failure
            </span>
            <span>
              <i className="dx-rcell tone-neutral" /> No failure observed
            </span>
            <span>
              <i className="dx-rcell tone-warn" /> Inconclusive or outage
            </span>
          </div>
        </Panel>

        {/* Graded benchmarks */}
        <Panel title="Benchmarks" flush>
          <ul className="dx-bench">
            <li>
              <span className="dx-bench-name">Accuracy against the answer key</span>
              {measured.length === 0 ? (
                <span className="dx-faint">Not measured yet. Appears when the project’s scorecard is exported.</span>
              ) : (
                <table className="dx-table dx-table-compact dx-bench-table">
                  <tbody>
                    {measured.map((m) => (
                      <tr key={m.key} title={m.definition}>
                        <td>{m.label}</td>
                        <td className="t-num" style={{ fontWeight: 600 }}>
                          {m.display}
                        </td>
                        <td className="t-num dx-faint">{m.n != null ? `n = ${m.n}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
            <li>
              <span className="dx-bench-name">Compared with simpler methods</span>
              {sc?.baselines.length ? (
                <table className="dx-table dx-table-compact dx-bench-table">
                  <tbody>
                    {sc.baselines.map((b) => (
                      <tr key={b.key}>
                        <td>{b.label}</td>
                        {Object.entries(b.metrics).map(([k, v]) => (
                          <td key={k} className="t-num" title={sc.metrics.find((m) => m.key === k)?.label ?? k}>
                            {v ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : byMode.length > 0 ? (
                <table className="dx-table dx-table-compact dx-bench-table">
                  <tbody>
                    {byMode.map((m) => (
                      <tr key={m.mode} title={RUN_MODE[m.mode].description}>
                        <td>{RUN_MODE[m.mode].label}</td>
                        <td className="t-num">
                          {m.same} of {m.n} runs match full Domino
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <span className="dx-faint">
                  Not loaded yet. Runs with parts of Domino switched off (no tools, no experiments, no semantic layer) appear here once the project has them.
                </span>
              )}
            </li>
          </ul>
        </Panel>
      </div>
    </>
  )
}

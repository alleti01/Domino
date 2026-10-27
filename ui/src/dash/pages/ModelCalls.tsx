// Model calls: which model actually answered, read from Nightshift receipts.
// The answer first, then one line per model with its share, then one line per
// run, with any run that wasn't fully answered by Nemotron called out.

import { isNemotron, shortModel } from '../../lib/labels'
import { href } from '../../lib/router'
import type { ModelReceipt, SiteData } from '../../types'
import { allRuns, changeTitle, fmtDuration, isExample, pct, shortRun, siteStats } from '../derive'
import { DIcon } from '../icons'
import { ExampleTag, PageHeader, Panel, rowLink } from '../ui'

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : null
}

/** What a model is used for, from the steps it answered. */
function roleOf(receipts: ModelReceipt[]) {
  const review = receipts.filter((r) => /review/i.test(r.step)).length
  if (review === receipts.length) return 'checks the explanation'
  if (review === 0) return 'reasons through the investigation'
  return 'reasons and reviews'
}

export function ModelCalls({ site }: { site: SiteData }) {
  const s = siteStats(site)
  const rows = allRuns(site).filter((r) => r.inv)
  const receipts = rows.flatMap((r) => r.inv!.receipts)
  const failed = receipts.filter((r) => r.outcome === 'failed').length
  const retried = receipts.filter((r) => r.attempts > 1).length
  const unreported = receipts.filter((r) => !r.routedModel).length
  const unreportedAllFailed = receipts.filter((r) => !r.routedModel).every((r) => r.outcome === 'failed')

  const models = [...s.routedModels.keys()]
    .map((m) => {
      const rs = receipts.filter((r) => (r.routedModel ?? 'not reported') === m)
      return { model: m, calls: rs.length, role: roleOf(rs), latency: median(rs.map((r) => r.latencyMs).filter((x): x is number => x != null)) }
    })
    .sort((a, b) => b.calls - a.calls)
  const maxCalls = Math.max(1, ...models.map((m) => m.calls))

  const runs = rows
    .map((r) => {
      const rc = r.inv!.receipts
      return { ...r, calls: rc.length, nemo: rc.filter((x) => x.routedModel && isNemotron(x.routedModel)).length, retried: rc.filter((x) => x.attempts > 1).length, latency: median(rc.map((x) => x.latencyMs).filter((x): x is number => x != null)) }
    })
    .sort((a, b) => a.nemo / (a.calls || 1) - b.nemo / (b.calls || 1))
  const mixed = runs.filter((r) => r.calls > 0 && r.nemo < r.calls).length

  return (
    <>
      <PageHeader
        title="Model calls"
        sub="Every reasoning step goes through Meterless Nightshift. Each call returns a compute receipt naming the model that actually answered; these figures are read from those receipts, not from what was requested."
        meta={site.cases.some((c) => isExample(c.kind)) ? <ExampleTag /> : undefined}
      />

      <div className="dx-stack">
        <section className="dx-answer">
          <div className="dx-answer-main">
            <div className="dx-answer-head">
              <span className="dx-answer-icon tone-accent">
                <DIcon name="model" size={22} />
              </span>
              <div>
                <h2 className="dx-answer-headline">
                  {pct(s.nemotronCalls, s.modelCalls)} of {s.modelCalls.toLocaleString('en-US')} model calls were answered by Nemotron
                </h2>
                <p className="dx-muted">
                  Read from each call’s Nightshift receipt.
                  {unreported > 0 &&
                    ` ${unreported} call${unreported === 1 ? '' : 's'} reported no model${unreportedAllFailed ? ' because the call failed' : ''}.`}
                </p>
              </div>
            </div>
            <dl className="dx-facts">
              <div>
                <dt>Calls</dt>
                <dd>{s.modelCalls.toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt>Runs</dt>
                <dd>{rows.length}</dd>
              </div>
              <div>
                <dt>Retried</dt>
                <dd>{retried}</dd>
              </div>
              <div>
                <dt>Failed after retries</dt>
                <dd>{failed}</dd>
              </div>
            </dl>
          </div>
        </section>

        <Panel title="Models" count={models.length} flush>
          <ol className="dx-xruns">
            {models.map((m) => (
              <li key={m.model} className="dx-mc-row">
                <span className={`dx-dot ${isNemotron(m.model) ? 'tone-accent' : 'tone-muted'}`} />
                <span className="dx-mc-name">
                  <span className="dx-model-name">{m.model === 'not reported' ? 'No model reported' : shortModel(m.model)}</span>
                  <span className="dx-faint">{m.model === 'not reported' ? (unreportedAllFailed ? 'calls that failed before a model answered' : 'receipt named no model') : m.role}</span>
                </span>
                <span className="dx-mc-share">
                  <span className="dx-mc-track">
                    <span className={`dx-mc-bar${isNemotron(m.model) ? '' : ' is-other'}`} style={{ width: `${(m.calls / maxCalls) * 100}%` }} />
                  </span>
                  <span className="dx-num dx-mc-n">{m.calls}</span>
                  <span className="dx-faint dx-num dx-mc-pct">{pct(m.calls, s.modelCalls)}</span>
                </span>
                <span className="dx-faint dx-num dx-mc-lat">{m.latency && m.model !== 'not reported' ? `${fmtDuration(m.latency)} median` : ''}</span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="By run" count={runs.length} desc={mixed ? `${mixed} not all Nemotron, shown first` : 'all Nemotron'} flush>
          <div className="dx-table-wrap">
            <table className="dx-table dx-inv dx-runs">
              <thead>
                <tr>
                  <th>Run</th>
                  <th className="t-num">Calls</th>
                  <th>Nemotron</th>
                  <th className="t-num">Median time</th>
                  <th className="t-num">Retried</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(({ caseEntry, run, inv, calls, nemo, retried: rt, latency }) => {
                  const link = href.case(caseEntry.id, { runId: run.runId, section: 'activity' })
                  return (
                    <tr key={run.runId} {...rowLink(link)}>
                      <td>
                        <span className="dx-runs-text">
                          <a className="t-title" href={link}>
                            {changeTitle(inv, caseEntry.label)}
                          </a>
                          <span className="t-sub">
                            {caseEntry.label} · <span className="dx-id">{shortRun(run.runId)}</span>
                          </span>
                        </span>
                      </td>
                      <td className="t-num">{calls}</td>
                      <td className="t-nowrap">
                        {calls === 0 ? (
                          <span className="dx-faint">—</span>
                        ) : nemo === calls ? (
                          <span className="dx-faint">All</span>
                        ) : (
                          <span className="dx-mc-mixed">
                            {nemo} of {calls}
                          </span>
                        )}
                      </td>
                      <td className="t-num dx-faint">{fmtDuration(latency)}</td>
                      <td className="t-num">{rt ? rt : <span className="dx-faint">0</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  )
}

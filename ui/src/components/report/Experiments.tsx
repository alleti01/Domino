import type { Investigation } from '../../types'
import { formatMs } from '../../lib/labels'
import { EvidenceLink, Ident } from '../common'
import { Icon } from '../Icon'
import { Instrument } from './Instrument'
import { armLabel, requestedBy } from './derive'

const show = (v: string | number | boolean | undefined) => (v === undefined ? '—' : String(v))

/** The central proof: the controlled comparison first, then every observation, check and log. */
export function ExperimentsView({ inv }: { inv: Investigation }) {
  const runs = inv.experiments
  if (runs.length === 0) {
    return (
      <section className="block">
        <h2 className="block-title">Experiments</h2>
        <p className="muted">
          {inv.status === 'running' ? 'No experiment had finished when this trace was saved.' : 'No experiments were run in this mode.'}
        </p>
      </section>
    )
  }
  const keys = [...new Set(runs.flatMap((x) => Object.keys(x.observations)))]
  const checks = [...new Set(runs.flatMap((x) => x.assertions.map((a) => a.name)))]

  return (
    <div className="stack">
      <div className="bench">
        <Instrument inv={inv} />
        <p className="cell cell-foot readout-sub">
          Same workload in an isolated sandbox; only the change differs. Pass or fail comes from the system's own checks, not the
          model.
        </p>
      </div>

      <section className="block" aria-labelledby="all-title">
        <h2 id="all-title" className="block-title">
          Every observation and check
        </h2>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="All observations and checks">
          <table className="table detail-table">
            <thead>
              <tr>
                <th scope="col">Recorded</th>
                {runs.map((x) => (
                  <th scope="col" key={x.id}>
                    {armLabel(x, runs)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k}>
                  <th scope="row">
                    <Ident name={k} />
                  </th>
                  {runs.map((x) => (
                    <td key={x.id} className="num">
                      {show(x.observations[k])}
                    </td>
                  ))}
                </tr>
              ))}
              {checks.map((name) => (
                <tr key={name} className="check-row">
                  <th scope="row">
                    Check <Ident name={name} />
                  </th>
                  {runs.map((x) => {
                    const a = x.assertions.find((y) => y.name === name)
                    if (!a) return <td key={x.id}>—</td>
                    return (
                      <td key={x.id} className={a.passed ? '' : 'is-fail'}>
                        <span className={`outcome tone-${a.passed ? 'ok' : 'fail'}`}>
                          <Icon name={a.passed ? 'check-circle' : 'x-circle'} size={13} />
                          {a.passed ? 'Passed' : 'Failed'}
                        </span>
                        {a.detail && <span className="cell-sub">{a.detail}</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="block" aria-labelledby="runs-title">
        <h2 id="runs-title" className="block-title">
          Each run
        </h2>
        <ul className="run-list">
          {runs.map((x) => (
            <li key={x.id}>
              <details>
                <summary>
                  <span className="run-name">{armLabel(x, runs)}</span>
                  <span className={`outcome tone-${x.outcome === 'pass' ? 'ok' : x.outcome === 'fail' ? 'fail' : 'warn'}`}>
                    {x.completed ? (x.outcome === 'pass' ? 'Passed' : x.outcome === 'fail' ? 'Failed' : 'Error') : 'Did not finish'}
                  </span>
                  {requestedBy(x) && <span className="muted">{requestedBy(x)}</span>}
                  <code className="run-id" title={x.id}>
                    {x.id}
                  </code>
                </summary>
                <dl className="facts">
                  {x.rationale && (
                    <div>
                      <dt>Why it was run</dt>
                      <dd>{x.rationale}</dd>
                    </div>
                  )}
                  {x.hypothesisIds.length > 0 && (
                    <div>
                      <dt>Tests</dt>
                      <dd>
                        {x.hypothesisIds.map((id, i) => (
                          <span key={id}>
                            {i > 0 && ', '}
                            <EvidenceLink id={id}>{id}</EvidenceLink>
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Workload and settings</dt>
                    <dd>
                      <code>{x.workload ?? 'default'}</code>
                      {Object.entries(x.params).map(([k, v]) => (
                        <code key={k} className="wrap-id">
                          {k}={String(v)}
                        </code>
                      ))}
                      {x.durationMs != null && <span className="muted"> · {formatMs(x.durationMs)}</span>}
                    </dd>
                  </div>
                  {x.reproduce && (
                    <div>
                      <dt>Reproduce</dt>
                      <dd>
                        <code className="wrap-id">{x.reproduce}</code>
                      </dd>
                    </div>
                  )}
                  {x.artifacts.length > 0 && (
                    <div>
                      <dt>Artifacts</dt>
                      <dd>
                        {x.artifacts.map((a) => (
                          <span key={a.name} className="artifact">
                            <code>{a.name}</code> {a.bytes} bytes · sha256 <code className="wrap-id">{a.sha256}</code>
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Full record</dt>
                    <dd>
                      <EvidenceLink id={x.id}>Open run {x.id} in the inspector</EvidenceLink>
                    </dd>
                  </div>
                </dl>
                <p className="log-label">Log</p>
                <pre className="log">{x.logs || 'No log recorded.'}</pre>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

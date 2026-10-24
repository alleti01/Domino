import type { ExperimentRun } from '../../types'
import { ARM_OUTCOME, ARM_ROLE, formatMs } from '../../lib/labels'
import { Badge, EvidenceLink, Pending, Section } from '../common'

const show = (v: string | number | boolean | undefined) => (v === undefined ? '—' : String(v))

export function ExperimentsSection({ experiments, running }: { experiments: ExperimentRun[]; running: boolean }) {
  // Observations appear in the order the runs first reported them.
  const keys = [...new Set(experiments.flatMap((x) => Object.keys(x.observations)))]
  const assertions = [...new Set(experiments.flatMap((x) => x.assertions.map((a) => a.name)))]
  const baseline = experiments.find((x) => x.variant === 'baseline' && x.completed)

  return (
    <Section
      id="experiments"
      title="Experiments"
      icon="flask"
      lede="Baseline, candidate and control run with the same workload; only the change differs. Pass and fail come from the world's own checks, not the model."
    >
      {experiments.length === 0 ? (
        <Pending>{running ? 'No experiment has finished yet.' : 'No experiments were run in this mode.'}</Pending>
      ) : (
        <>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Experiment results">
            <table className="table arms">
              <thead>
                <tr>
                  <th scope="col">Measure</th>
                  {experiments.map((x) => (
                    <th scope="col" key={x.id}>
                      {ARM_ROLE[x.variant]}
                      <span className="th-sub">
                        <EvidenceLink id={x.id}>{x.id}</EvidenceLink>
                        {x.requestedBy === 'harness' && ' · added by harness'}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k}>
                    <th scope="row">
                      <code>{k}</code>
                    </th>
                    {experiments.map((x) => {
                      const v = x.observations[k]
                      const differs = baseline && x !== baseline && v !== undefined && v !== baseline.observations[k]
                      return (
                        <td key={x.id} className={`num${differs ? ' differs' : ''}`}>
                          {show(v)}
                          {differs && <span className="differs-note"> ≠ baseline</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {assertions.map((name) => (
                  <tr key={name}>
                    <th scope="row">
                      Check <code>{name}</code>
                    </th>
                    {experiments.map((x) => {
                      const a = x.assertions.find((y) => y.name === name)
                      if (!a) return <td key={x.id}>—</td>
                      return (
                        <td key={x.id}>
                          <Badge tone={a.passed ? 'ok' : 'fail'} icon={a.passed ? 'check-circle' : 'x-circle'}>
                            {a.passed ? 'Passed' : 'Failed'}
                          </Badge>
                          {!a.passed && a.detail && <span className="th-sub">{a.detail}</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr className="outcome-row">
                  <th scope="row">Outcome</th>
                  {experiments.map((x) => {
                    const o = ARM_OUTCOME[x.outcome]
                    return (
                      <td key={x.id}>
                        <Badge tone={o.tone} icon={o.icon}>
                          {x.completed ? o.label : 'Did not finish'}
                        </Badge>
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="logs">
            {experiments.map((x) => (
              <details key={x.id}>
                <summary>
                  {ARM_ROLE[x.variant]} <code>{x.id}</code>: why, settings and log
                </summary>
                <dl className="hyp-detail">
                  {x.rationale && (
                    <div>
                      <dt>Why it was run</dt>
                      <dd>{x.rationale}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Workload and settings</dt>
                    <dd>
                      <code>{x.workload ?? 'default'}</code>
                      {Object.entries(x.params).map(([k, v]) => (
                        <code key={k}>
                          {' '}
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
                        <code>{x.reproduce}</code>
                      </dd>
                    </div>
                  )}
                  {x.artifacts.length > 0 && (
                    <div>
                      <dt>Artifacts</dt>
                      <dd>
                        {x.artifacts.map((a) => (
                          <span key={a.name} className="th-sub">
                            <code>{a.name}</code> · {a.bytes} bytes · sha256 <code>{a.sha256.slice(0, 12)}…</code>
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                </dl>
                <pre>{x.logs || 'No log recorded.'}</pre>
              </details>
            ))}
          </div>
        </>
      )}
    </Section>
  )
}

import type { Investigation } from '../types'
import { ARM_OUTCOME, ARM_ROLE, LINK_STATUS, VERDICT, isNemotron, shortModel } from '../lib/labels'
import { href } from '../lib/router'
import { plural } from '../lib/runs'
import { Badge } from './common'
import { Icon } from './Icon'

/** How an engineer would meet Domino: a check run plus a short comment linking to the report. */
export function PrCheckView({ inv, runParam }: { inv: Investigation; runParam: string | null }) {
  const v = inv.verdict ? VERDICT[inv.verdict.verdict] : null
  const byModel = new Map<string, number>()
  for (const r of inv.receipts) if (r.routedModel) byModel.set(r.routedModel, (byModel.get(r.routedModel) ?? 0) + 1)
  const allNemotron = inv.receipts.length > 0 && inv.receipts.every((r) => r.routedModel && isNemotron(r.routedModel))
  const report = (section?: string) => href.case(inv.caseId, { runId: runParam, section })
  // The comment shows the first few observations; the report has all of them.
  const keys = [...new Set(inv.experiments.flatMap((x) => Object.keys(x.observations)))].slice(0, 3)

  return (
    <div className="pr">
      <p className="small muted">A preview of the check and comment Domino posts on the pull request, built from this run.</p>
      <div className="pr-checks" aria-label="Checks">
        <div className="pr-check">
          <span className={`tone-text-${v ? v.tone : 'muted'}`}>
            <Icon name={v ? v.icon : 'clock'} size={18} />
          </span>
          <strong>Domino / investigation</strong>
          <span className="muted">{v ? v.label : 'In progress'}</span>
          <a className="pr-details small" href={report()}>
            Details
          </a>
        </div>
      </div>

      <div className="pr-comment">
        <div className="pr-comment-head">
          <span className="pr-avatar" aria-hidden="true">
            D
          </span>
          <strong>domino</strong>
          <span className="pr-bot">bot</span>
          <span className="muted small">commented on {inv.change?.changeId ?? 'this PR'}</span>
        </div>

        <div className="pr-comment-body">
          {inv.replay && (
            <p className="pr-quote small">Replayed from a recorded run (no live model or data layer).</p>
          )}
          {!inv.verdict || !v ? (
            <p>Investigation in progress. This comment updates when the experiments finish.</p>
          ) : (
            <>
              <h2 className="pr-verdict">
                <span className={`tone-text-${v.tone}`}>
                  <Icon name={v.icon} size={20} />
                </span>
                {v.label}
              </h2>
              <p>
                <strong>{inv.change?.title}</strong>: {inv.verdict.headline}
              </p>
              {inv.verdict.wordingNote && <p className="wording-note small">{inv.verdict.wordingNote}</p>}

              {inv.chain.causal.length > 0 && (
                <>
                  <h3>
                    <a href={report('chain')}>How the change reaches the failure</a>
                  </h3>
                  <ol className="pr-chain">
                    {inv.chain.causal.map((link, i) => (
                      <li key={i}>
                        <code>{link.text}</code> <Badge tone={LINK_STATUS[link.status].tone}>{LINK_STATUS[link.status].label}</Badge>{' '}
                        <span className="muted small">{link.refs.flatMap((r) => r.ids).join(', ')}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {inv.experiments.length > 0 && (
                <>
                  <h3>
                    <a href={report('experiments')}>Experiments</a>{' '}
                    <span className="muted small">(same workload; only the change differs)</span>
                  </h3>
                  <div className="table-scroll" tabIndex={0} role="region" aria-label="Experiments summary">
                    <table className="table">
                      <thead>
                        <tr>
                          <th scope="col">Run</th>
                          {keys.map((k) => (
                            <th scope="col" key={k}>
                              <code>{k}</code>
                            </th>
                          ))}
                          <th scope="col">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inv.experiments.map((x) => {
                          const o = ARM_OUTCOME[x.outcome]
                          const failed = x.assertions.filter((a) => !a.passed).map((a) => a.name)
                          return (
                            <tr key={x.id}>
                              <th scope="row">
                                {ARM_ROLE[x.variant]}
                                {x.requestedBy === 'harness' && <span className="th-sub">added by harness</span>}
                              </th>
                              {keys.map((k) => (
                                <td key={k} className="num">
                                  {x.observations[k] === undefined ? '—' : String(x.observations[k])}
                                </td>
                              ))}
                              <td>
                                <Badge tone={o.tone} icon={o.icon}>
                                  {x.completed ? o.label : 'Did not finish'}
                                </Badge>
                                {failed.length > 0 && <span className="th-sub">{failed.join(', ')}</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {inv.verdict.mitigation && (
                <p>
                  <strong>Suggested mitigation</strong> (from the model, <em>not verified by Domino</em>):{' '}
                  {inv.verdict.mitigation}
                </p>
              )}

              <details>
                <summary>What was tested and limitations</summary>
                <ul className="bullets">
                  {inv.verdict.tested.map((t, i) => (
                    <li key={`t${i}`}>{t}</li>
                  ))}
                  {inv.verdict.limitations.map((t, i) => (
                    <li key={`l${i}`}>{t}</li>
                  ))}
                </ul>
              </details>
            </>
          )}

          <p>
            <a className="button" href={report()}>
              Open the full investigation
            </a>
          </p>

          <p className="pr-footer small muted">
            Verdict decided by Domino's deterministic judge, not the model.{' '}
            <a href={report('receipts')}>{plural(inv.receipts.length, 'model call')}</a> via Meterless Nightshift:{' '}
            {[...byModel].map(([m, n], i) => (
              <span key={m}>
                {i > 0 && ', '}
                <code>{shortModel(m)}</code> ×{n}
              </span>
            ))}
            {allNemotron && ' (all NVIDIA Nemotron)'}. {plural(inv.queries, 'semantic-layer query')} · run{' '}
            <code>{inv.runId}</code>
          </p>
        </div>
      </div>
    </div>
  )
}

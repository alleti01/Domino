import type { Investigation } from '../types'
import { LINK_STATUS, REVIEW_OUTCOME, VERDICT, VERDICT_RULE, isNemotron, shortModel } from '../lib/labels'
import { traceOrigin } from '../lib/report'
import { href } from '../lib/router'
import { plural } from '../lib/runs'
import { VerdictMark } from './common'
import { Icon } from './Icon'
import { investigationMap } from '../lib/graph'
import { pathTitle } from './report/derive'
import { Instrument } from './report/Instrument'

/** How an engineer would meet Domino: a check run plus a short comment linking to the report. */
export function PrCheckView({ inv, runParam }: { inv: Investigation; runParam: string | null }) {
  const v = inv.verdict ? VERDICT[inv.verdict.verdict] : null
  const byModel = new Map<string, number>()
  for (const r of inv.receipts) if (r.routedModel) byModel.set(r.routedModel, (byModel.get(r.routedModel) ?? 0) + 1)
  const allNemotron = inv.receipts.length > 0 && inv.receipts.every((r) => r.routedModel && isNemotron(r.routedModel))
  const report = (section?: string) => href.case(inv.caseId, { runId: runParam, section })
  const review = inv.review ? REVIEW_OUTCOME[inv.review.outcome] : null

  return (
    <div className="report-body pr-layout">
      <aside className="pr-aside" aria-label="About this preview">
        <p className="kicker">Preview · not posted</p>
        <p className="pr-aside-title">What Domino would post on the pull request</p>
        <p className="readout-sub">
          Built from this saved run. Nothing is sent to GitHub from this page, and no comment or check exists there.
        </p>
        <dl className="insp-facts">
          <div>
            <dt>Check</dt>
            <dd>Domino / investigation</dd>
          </div>
          <div>
            <dt>Source run</dt>
            <dd>
              <code className="wrap-id">{inv.runId}</code>
            </dd>
          </div>
        </dl>
      </aside>
      <div className="pr">
        <div className="pr-checks" aria-label="Checks">
          <div className="pr-check">
            <span className={`tone-text-${v ? v.tone : 'muted'}`}>
              <Icon name={v ? v.icon : 'clock'} size={18} />
            </span>
            <strong>Domino / investigation</strong>
            <span className="muted">{v ? v.label : 'No verdict in the saved trace'}</span>
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
            <span className="muted small">
              on <code className="wrap-id">{inv.change?.changeId ?? 'this change'}</code>
            </span>
          </div>

          <div className="pr-comment-body">
            <p className="pr-quote small">{traceOrigin(inv)}.</p>
            {!inv.verdict ? (
              <p>The saved trace ends before the experiments finished, so this comment has no verdict to report.</p>
            ) : (
              <>
                <h2 className="pr-verdict">
                  <VerdictMark verdict={inv.verdict.verdict} />
                </h2>
                <p className="small muted">{VERDICT_RULE[inv.verdict.verdict]}</p>
                <p>
                  <strong>{inv.change?.title}</strong>: {inv.verdict.headline}
                </p>
                {inv.verdict.wordingNote && <p className="small muted">{inv.verdict.wordingNote}</p>}
                {review && inv.review && (
                  <p className="small">
                    <span className={`status-chip tone-${review.tone}`}>
                      <Icon name={review.icon} size={13} /> {review.label}
                    </span>{' '}
                    <span className="muted">
                      explanation checked by a second model
                      {inv.review.issues.length > 0 && `: ${plural(inv.review.issues.length, 'unsupported claim')}`}
                    </span>
                  </p>
                )}

                {inv.chain.causal.length > 0 && (
                  <>
                    <h3>
                      <a href={report('chain')}>{pathTitle(inv)}</a>
                    </h3>
                    <PrPath inv={inv} />
                  </>
                )}

                {inv.experiments.length > 0 && (
                  <>
                    <h3>
                      <a href={report('experiments')}>Experiments</a>{' '}
                      <span className="muted small">(same workload; only the change differs)</span>
                    </h3>
                    <Instrument inv={inv} focus={false} />
                  </>
                )}

                {inv.verdict.mitigation && (
                  <div className="pr-mitigation">
                    <span className="tag-unverified">
                      <Icon name="alert" size={13} /> Unverified suggestion from the model
                    </span>
                    <p>{inv.verdict.mitigation}</p>
                    <p className="small muted">Domino has not tested this change.</p>
                  </div>
                )}

                {(inv.verdict.tested.length > 0 || inv.verdict.limitations.length > 0) && (
                  <details className="side-details">
                    <summary>What was tested and its limits</summary>
                    <ul className="plain-bullets">
                      {inv.verdict.tested.map((t, i) => (
                        <li key={`t${i}`}>{t}</li>
                      ))}
                      {inv.verdict.limitations.map((t, i) => (
                        <li key={`l${i}`}>{t}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}

            <p>
              <a className="button" href={report()}>
                Open the full investigation <Icon name="arrow-right" size={14} />
              </a>
            </p>

            <p className="pr-footer">
              Verdict decided by Domino's deterministic judge, not the model.{' '}
              <a href={report('receipts')}>{plural(inv.receipts.length, 'model call')}</a> via Meterless Nightshift
              {byModel.size > 0 && ': '}
              {[...byModel].map(([m, n], i) => (
                <span key={m}>
                  {i > 0 && ', '}
                  <code>{shortModel(m)}</code> ×{n}
                </span>
              ))}
              {allNemotron && ' (all NVIDIA Nemotron)'}. {plural(inv.queries, 'semantic-layer query')} · run{' '}
              <code className="wrap-id">{inv.runId}</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The verdict's path as the comment would render it: plain text with each link's status. */
function PrPath({ inv }: { inv: Investigation }) {
  const map = investigationMap(inv)
  const label = new Map(map.nodes.map((n) => [n.id, n.label]))
  const links = map.path.slice(1).map((id, i) => map.edges.find((e) => e.onPath && e.from === map.path[i] && e.to === id))
  return (
    <ol className="pr-path">
      <li>
        <code>{label.get(map.path[0])}</code>
      </li>
      {links.map((e, i) =>
        e ? (
          <li key={e.id}>
            <span className={`pr-rel status-${e.status}`}>
              {e.relation.replace(/_/g, ' ')} <span className="muted">({LINK_STATUS[e.status].label.toLowerCase()})</span>
            </span>{' '}
            <code>{label.get(map.path[i + 1])}</code>
          </li>
        ) : null,
      )}
    </ol>
  )
}

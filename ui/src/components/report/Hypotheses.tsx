import type { Hypothesis, Investigation, SourceRef } from '../../types'
import { ARM_OUTCOME, HYPOTHESIS } from '../../lib/labels'
import { EvidenceLink, Refs } from '../common'
import { Icon } from '../Icon'
import { armLabel } from './derive'

const count = (refs: SourceRef[]) => refs.reduce((n, r) => n + r.ids.length, 0)

/** What the model suspected, how it could be disproved, and what the runs did to it. */
export function HypothesesView({ inv }: { inv: Investigation }) {
  return (
    <div className="stack">
      <header className="cell-head">
        <p className="kicker">Hypotheses · {inv.hypotheses.length}</p>
        <h2 className="cell-title">What the model suspected, and what the runs did to it</h2>
        <p className="cell-lede">
          Written by the model as claims an experiment could prove wrong. Statuses are as the agent recorded them after the runs;
          the verdict itself comes from the deterministic judge.
        </p>
      </header>
      {inv.hypotheses.length === 0 ? (
        <div className="pending-state">
          <strong>No hypotheses in this trace</strong>
          <span>{inv.status === 'running' ? 'The recording ends before the agent wrote any.' : 'The agent recorded none for this run.'}</span>
        </div>
      ) : (
        <ol className="hyp-list">
          {inv.hypotheses.map((h) => (
            <HypothesisRow key={h.id} h={h} inv={inv} />
          ))}
        </ol>
      )}
    </div>
  )
}

function HypothesisRow({ h, inv }: { h: Hypothesis; inv: Investigation }) {
  const s = HYPOTHESIS[h.status]
  const runs = h.experimentIds.map((id) => ({ id, run: inv.experiments.find((x) => x.id === id) }))
  return (
    <li className="hyp">
      <div className="hyp-main">
        <div className="hyp-head">
          <EvidenceLink id={h.id} className="hyp-id">
            {h.id}
          </EvidenceLink>
          <span className={`status-chip tone-${s.tone}`}>
            <Icon name={s.icon} size={13} />
            {s.label}
          </span>
          {h.history.length > 0 && <span className="hyp-history">was {h.history.map((st) => HYPOTHESIS[st].label.toLowerCase()).join(' → ')}</span>}
        </div>
        <p className="hyp-claim">{h.claim}</p>
        <dl className="facts">
          <div>
            <dt>Mechanism</dt>
            <dd>{h.mechanism}</dd>
          </div>
          <div>
            <dt>Disproved by</dt>
            <dd>{h.falsifiedBy}</dd>
          </div>
        </dl>
        {h.revisions.length > 0 && (
          <details className="side-details">
            <summary>
              {h.revisions.length} revision{h.revisions.length > 1 ? 's' : ''}
            </summary>
            <ul className="plain-bullets">
              {h.revisions.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <dl className="hyp-ledger" aria-label={`Evidence for ${h.id}`}>
        <div>
          <dt className="kicker">Evidence for</dt>
          <dd>
            <span className="ledger-count">{count(h.evidenceFor)}</span>
            <Refs refs={h.evidenceFor} empty={<span className="muted">None cited</span>} />
          </dd>
        </div>
        <div>
          <dt className="kicker">Evidence against</dt>
          <dd>
            <span className="ledger-count">{count(h.evidenceAgainst)}</span>
            <Refs refs={h.evidenceAgainst} empty={<span className="muted">None cited</span>} />
          </dd>
        </div>
        <div>
          <dt className="kicker">Tested by</dt>
          <dd>
            {runs.length === 0 ? (
              <span className="muted">No sandbox run linked</span>
            ) : (
              <ul className="ledger-runs">
                {runs.map(({ id, run }) => {
                  const o = run ? ARM_OUTCOME[run.outcome] : null
                  return (
                    <li key={id}>
                      <EvidenceLink id={id}>{run ? armLabel(run, inv.experiments) : <code>{id}</code>}</EvidenceLink>
                      {o && run && (
                        <span className={`outcome tone-${o.tone}`}>
                          <Icon name={o.icon} size={13} /> {run.completed ? o.label : 'Did not finish'}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </dd>
        </div>
        {h.confidence != null && (
          <div>
            <dt className="kicker">Model's confidence</dt>
            <dd>
              <span className="ledger-count is-quiet">{Math.round(h.confidence * 100)}%</span>
              <span className="muted small">The model's own estimate; advisory, not evidence.</span>
            </dd>
          </div>
        )}
      </dl>
    </li>
  )
}

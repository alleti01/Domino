import type { Hypothesis, SourceRef } from '../../types'
import { HYPOTHESIS } from '../../lib/labels'
import { Badge, EvidenceLink, Pending, Refs, Section } from '../common'

function EvidenceList({ title, refs }: { title: string; refs: SourceRef[] }) {
  return (
    <div className="evidence">
      <h4>{title}</h4>
      <Refs refs={refs} empty={<p className="muted small">None cited.</p>} />
    </div>
  )
}

export function HypothesesSection({ hypotheses }: { hypotheses: Hypothesis[] }) {
  return (
    <Section
      id="hypotheses"
      title="Hypotheses"
      icon="list"
      lede="What Domino suspected might break, the mechanism it proposed, and the evidence it cited for and against."
    >
      {hypotheses.length === 0 && <Pending>No hypotheses yet.</Pending>}
      <ol className="card-list">
        {hypotheses.map((h) => {
          const s = HYPOTHESIS[h.status]
          return (
            <li key={h.id} className="card">
              <div className="card-head">
                <EvidenceLink id={h.id} className="rank">
                  {h.id}
                </EvidenceLink>
                <p className="card-title">{h.claim}</p>
                <Badge tone={s.tone} icon={s.icon}>
                  {s.label}
                </Badge>
              </div>
              {h.history.length > 0 && (
                <p className="small muted">
                  Revised: {[...h.history, h.status].map((st) => HYPOTHESIS[st].label.toLowerCase()).join(' → ')}
                </p>
              )}
              <dl className="hyp-detail">
                <div>
                  <dt>Mechanism</dt>
                  <dd>{h.mechanism}</dd>
                </div>
                <div>
                  <dt>Would be disproved by</dt>
                  <dd>{h.falsifiedBy}</dd>
                </div>
              </dl>
              <div className="evidence-grid">
                <EvidenceList title="Evidence for" refs={h.evidenceFor} />
                <EvidenceList title="Evidence against" refs={h.evidenceAgainst} />
              </div>
              {h.revisions.length > 0 && (
                <details>
                  <summary>
                    {h.revisions.length} revision{h.revisions.length > 1 ? 's' : ''}
                  </summary>
                  <ul className="bullets small">
                    {h.revisions.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="small muted">
                {h.experimentIds.length > 0 && (
                  <>
                    Tested by{' '}
                    {h.experimentIds.map((id, i) => (
                      <span key={id}>
                        {i > 0 && ', '}
                        <EvidenceLink id={id}>{id}</EvidenceLink>
                      </span>
                    ))}
                    {h.confidence != null && ' · '}
                  </>
                )}
                {h.confidence != null && <>Model's own confidence {Math.round(h.confidence * 100)}% (advisory, not evidence)</>}
              </p>
            </li>
          )
        })}
      </ol>
    </Section>
  )
}

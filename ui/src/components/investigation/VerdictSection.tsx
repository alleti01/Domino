import type { ReviewSummary, RunError, RunStatus, VerdictReport } from '../../types'
import { REVIEW_OUTCOME, VERDICT, shortModel } from '../../lib/labels'
import { Icon } from '../Icon'
import { Badge, EvidenceLink, Pending, Refs, Section } from '../common'

const NO_VERDICT: Record<RunStatus, { tone: string; title: string; text: string }> = {
  running: { tone: 'muted', title: 'Investigation in progress', text: 'No verdict yet. Results appear as the agent finishes each step.' },
  complete: { tone: 'muted', title: 'No verdict recorded', text: 'The run finished without a verdict event.' },
  failed: { tone: 'fail', title: 'The run failed before a verdict', text: 'No verdict was reached. The error is below.' },
  outage: {
    tone: 'warn',
    title: 'Outage: Nightshift or Zetaris was unavailable',
    text: 'This run is excluded from scoring rather than counted as a wrong answer.',
  },
}

/** Verdict shown at the top of the investigation page. */
export function VerdictBanner({
  report,
  status,
  errors,
  review,
}: {
  report: VerdictReport | null
  status: RunStatus
  errors: RunError[]
  review: ReviewSummary | null
}) {
  if (!report) {
    const s = NO_VERDICT[status]
    const fatal = errors.find((e) => !e.recoverable)
    return (
      <div className={`verdict-banner tone-${s.tone}`} role="status">
        <Icon name={status === 'running' ? 'clock' : 'alert'} size={24} />
        <div>
          <p className="verdict-label">{s.title}</p>
          <p className="verdict-summary">{s.text}</p>
          {fatal && (
            <p className="small">
              <EvidenceLink id={fatal.stepId}>
                Error in {fatal.stage}: {fatal.message}
              </EvidenceLink>
            </p>
          )}
        </div>
      </div>
    )
  }
  const v = VERDICT[report.verdict]
  return (
    <div className={`verdict-banner tone-${v.tone}`}>
      <Icon name={v.icon} size={24} />
      <div>
        <p className="verdict-kicker">Verdict{status === 'outage' ? ' · outage, excluded from scoring' : ''}</p>
        <p className="verdict-label">{v.label}</p>
        <p className="verdict-summary">{report.headline}</p>
        {report.cause && (
          <p className="verdict-cause">
            <span className="muted">The model's explanation: </span>
            {report.cause}
          </p>
        )}
        {report.wordingNote && (
          <p className="wording-note small">
            <Icon name="info" size={14} /> {report.wordingNote}
          </p>
        )}
        {review && review.outcome !== 'approved' && (
          <p className="wording-note small">
            <Icon name={REVIEW_OUTCOME[review.outcome].icon} size={14} /> {REVIEW_OUTCOME[review.outcome].label}:{' '}
            {REVIEW_OUTCOME[review.outcome].text}
          </p>
        )}
      </div>
    </div>
  )
}

/** The second model's check of the explanation: outcome, and every claim it couldn't find evidence for. */
function ReviewBlock({ review }: { review: ReviewSummary }) {
  const o = REVIEW_OUTCOME[review.outcome]
  return (
    <div className="review">
      <h3>Second-model review of the explanation</h3>
      <p>
        <Badge tone={o.tone} icon={o.icon}>
          {o.label}
        </Badge>{' '}
        <span className="small muted">
          {review.rounds} {review.rounds === 1 ? 'round' : 'rounds'}
          {review.reviewerModel && (
            <>
              {' '}
              · reviewed by <code>{shortModel(review.reviewerModel)}</code>
            </>
          )}
        </span>
      </p>
      <p className="small muted">{o.text}</p>
      {review.issues.length > 0 && (
        <ul className="review-issues">
          {review.issues.map((i, n) => (
            <li key={n}>
              <p>
                <span className="small muted">
                  <EvidenceLink id={i.stepId}>Round {i.round}</EvidenceLink> · claim:
                </span>{' '}
                “{i.statement}”
              </p>
              <p className="small">{i.problem}</p>
              <Refs refs={i.refs} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function VerdictSection({ report, review }: { report: VerdictReport | null; review: ReviewSummary | null }) {
  return (
    <Section id="verdict" title="Verdict and limits" icon="flag" lede="What was tested, what this result does not show, and who decided it.">
      {!report ? (
        <Pending>The verdict is decided after the experiments finish.</Pending>
      ) : (
        <>
          <div className="two-col">
            <div>
              <h3>What was tested</h3>
              <ul className="bullets">
                {report.tested.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Limitations</h3>
              <ul className="bullets">
                {report.limitations.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
          {report.mitigation && (
            <div className="mitigation">
              <h3>Suggested mitigation</h3>
              <p>{report.mitigation}</p>
              <p className="small muted">Suggested by the model. Domino has not tested or verified it.</p>
            </div>
          )}
          {review && <ReviewBlock review={review} />}
          <p className="small">
            Decided by{' '}
            {report.decidedBy === 'deterministic_judge' ? (
              <strong>Domino's deterministic judge</strong>
            ) : (
              <strong className="warn-text">"{report.decidedBy}" (not the deterministic judge)</strong>
            )}
            : baseline passes, the candidate fails repeatedly, and the control passes again. The model never sets the
            verdict.
          </p>
        </>
      )}
      <p className="small muted fine-print">
        Domino reports one of three verdicts: reproduced failure, no failure observed under these tests, or
        inconclusive. None of them means the change is safe in production.
      </p>
    </Section>
  )
}

import { LINK_STATUS, REVIEW_OUTCOME, shortModel } from '../../../lib/labels'
import type { CaseEntry, Investigation } from '../../../types'
import { LINK_TONE, More, Panel, Refs, Status, Tag } from '../../ui'
import { Answer } from './Answer'
import { buildFlow, Flow } from './Flow'

// ---------- Summary ----------

/** The model's proposed code change: code-level, untested, so it waits behind a click. */
function Mitigation({ text }: { text: string }) {
  return (
    <More
      summary={
        <>
          Suggested code change
          <span className="dx-more-meta">
            <Tag tone="warn">Not tested</Tag>
          </span>
        </>
      }
    >
      <p className="dx-prose">{text}</p>
      <p className="dx-faint dx-mt-s">Proposed by the model. Domino has not run it.</p>
    </More>
  )
}

export function SummaryTab({ inv, caseEntry, runParam }: { inv: Investigation; caseEntry: CaseEntry; runParam: string | null }) {
  const review = inv.review ? REVIEW_OUTCOME[inv.review.outcome] : null
  const issues = inv.review?.issues ?? []
  const hasWhy = inv.chain.causal.length > 0 || !!inv.verdict?.cause
  const breaks = inv.verdict?.verdict === 'reproduced_failure'
  const hasFlow = buildFlow(inv).length > 0
  return (
    <div className="dx-stack">
      <Answer inv={inv} caseEntry={caseEntry} runParam={runParam} />

      <Flow inv={inv} runParam={runParam} />

      {hasWhy && (
        <Panel title={hasFlow ? undefined : breaks ? 'Why it breaks' : 'What the change touches'}>
          <div className={hasFlow ? 'dx-more-group is-first' : 'dx-more-group'}>
            {inv.chain.causal.length > 0 && (
              <More summary={`Evidence for each step (${inv.chain.causal.length})`}>
                <ol className="dx-chain">
                  {inv.chain.causal.map((l, i) => (
                    <li key={i} className={l.status === 'inferred' ? 'is-inferred' : undefined}>
                      <span className="dx-chain-n">{i + 1}</span>
                      <div className="dx-chain-body">
                        <span>{l.text}</span>
                        {l.detail && <span className="dx-chain-detail">{l.detail}</span>}
                        <div className="dx-row dx-wrap">
                          <Tag tone={LINK_TONE[l.status]}>{LINK_STATUS[l.status].label}</Tag>
                          <Refs refs={l.refs} empty="No rows cited" />
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </More>
            )}
            {inv.verdict?.cause && (
              <More
                summary={
                  <>
                    The model’s explanation
                    {review && (
                      <span className="dx-more-meta">
                        <Status tone={review.tone}>{review.label.replace('Explanation ', '').replace(/^./, (c) => c.toUpperCase())}</Status>
                      </span>
                    )}
                  </>
                }
              >
                {inv.verdict.headline && <p className="dx-prose" style={{ fontWeight: 550 }}>{inv.verdict.headline}</p>}
                <p className="dx-prose dx-mt-s">{inv.verdict.cause}</p>
                {inv.review?.reviewerModel && (
                  <p className="dx-faint dx-mt-s">
                    Checked against the evidence by {shortModel(inv.review.reviewerModel)}
                    {inv.review.rounds > 1 ? ` over ${inv.review.rounds} rounds` : ''}.
                  </p>
                )}
              </More>
            )}
            {inv.verdict?.mitigation && <Mitigation text={inv.verdict.mitigation} />}
            {issues.length > 0 && (
              <More
                summary={
                  inv.review?.outcome === 'approved'
                    ? `Earlier reviewer findings, resolved before approval (${issues.length})`
                    : `Reviewer findings (${issues.length})`
                }
                open={inv.review?.outcome !== 'approved'}
              >
                <ul className="dx-list">
                  {issues.map((s, i) => (
                    <li key={i}>
                      <span>{s.statement}</span> <span className="dx-muted">: {s.problem}</span> <Refs refs={s.refs} empty="" />
                    </li>
                  ))}
                </ul>
              </More>
            )}
          </div>
        </Panel>
      )}

      {inv.verdict?.mitigation && !hasWhy && (
        <section className="dx-panel">
          <Mitigation text={inv.verdict.mitigation} />
        </section>
      )}

      {inv.verdict && (inv.verdict.tested.length > 0 || inv.verdict.limitations.length > 0) && (
        <section className="dx-panel">
          <More summary="What was tested, and known limits">
            <div className="dx-grid-2">
              <div>
                <div className="dx-eyebrow" style={{ marginBottom: 6 }}>
                  Tested
                </div>
                {inv.verdict.tested.length ? (
                  <ul className="dx-list">
                    {inv.verdict.tested.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="dx-faint">Not recorded</span>
                )}
              </div>
              <div>
                <div className="dx-eyebrow" style={{ marginBottom: 6 }}>
                  Limits
                </div>
                {inv.verdict.limitations.length ? (
                  <ul className="dx-list">
                    {inv.verdict.limitations.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="dx-faint">None recorded</span>
                )}
              </div>
            </div>
            {inv.verdict.wordingNote && <p className="dx-faint dx-mt">{inv.verdict.wordingNote}</p>}
          </More>
        </section>
      )}
    </div>
  )
}

import { useState } from 'react'
import type { Investigation, RunStatus } from '../../types'
import { HYPOTHESIS, REVIEW_OUTCOME, RUN_STATUS, VERDICT, VERDICT_RULE, shortModel } from '../../lib/labels'
import { href } from '../../lib/router'
import { plural } from '../../lib/runs'
import { EvidenceLink, Refs, VerdictMark } from '../common'
import { Icon } from '../Icon'
import { DependencyMap } from './DependencyMap'
import { Instrument } from './Instrument'

const NO_VERDICT: Record<RunStatus, { title: string; text: string }> = {
  running: { title: 'No verdict in this saved trace', text: 'The recording ends before the experiments finished, so there is no result to report.' },
  complete: { title: 'No verdict recorded', text: 'The run finished without a verdict event.' },
  stopped: { title: 'The run stopped before a verdict', text: 'Nothing new was written for over 11 minutes and the run never finished.' },
  failed: { title: 'The run failed before a verdict', text: 'No verdict was reached. The error is below.' },
  outage: { title: 'Outage: Nightshift or Zetaris was unavailable', text: 'This run is excluded from scoring rather than counted as a wrong answer.' },
}

/** One line of what was tested, from the runs themselves. */
function scope(inv: Investigation) {
  const done = inv.experiments.filter((x) => x.completed)
  const by = (v: string) => done.filter((x) => x.variant === v).length
  const parts = [['baseline', by('baseline')], ['candidate', by('candidate')], ['control', by('control')]]
    .filter(([, n]) => (n as number) > 0)
    .map(([v, n]) => (n === 1 ? v : `${v} ×${n}`))
  return done.length === 0 ? 'No sandbox runs completed.' : `Tested in ${plural(done.length, 'sandbox run')}: ${parts.join(', ')}.`
}

/**
 * The result first, then the relationship Domino investigated and the
 * experiment that decided it, then the explanation and what remains open.
 * One framed composition: cells share their borders rather than float as cards.
 */
export function SummaryView({ inv, runParam }: { inv: Investigation; runParam: string | null }) {
  const at = (section: string) => href.case(inv.caseId, { runId: runParam, section })
  const v = inv.verdict
  const review = inv.review ? REVIEW_OUTCOME[inv.review.outcome] : null
  const fatal = inv.errors.find((e) => !e.recoverable)
  const openHyps = inv.hypotheses.filter((h) => h.status === 'open' || h.status === 'untested')
  const passed = inv.experiments.filter((x) => x.completed && x.outcome === 'pass').length
  const failed = inv.experiments.filter((x) => x.completed && x.outcome !== 'pass').length
  const unfinished = inv.experiments.filter((x) => !x.completed).length
  // One chosen run, read in both the instrument and beside the map.
  const [experimentId, setExperimentId] = useState<string | null>(null)

  return (
    <div className="summary">
      <section className="bench readouts" id="verdict" aria-label="Result">
        <div className={`cell readout-verdict tone-${v ? VERDICT[v.verdict].tone : RUN_STATUS[inv.status].tone}`}>
          <p className="kicker">{v ? 'Verdict · deterministic judge' : 'Verdict'}</p>
          {v ? (
            <>
              <VerdictMark verdict={v.verdict} large />
              {v.decidedBy === 'deterministic_judge' ? (
                <p className="readout-sub">
                  Decided from the run results, not by a model. {VERDICT_RULE[v.verdict]}
                </p>
              ) : (
                <p className="readout-sub warn-text">Decided by “{v.decidedBy}”, not the deterministic judge. Treat this verdict with caution.</p>
              )}
            </>
          ) : (
            <>
              <p className={`verdict-mark is-large tone-${RUN_STATUS[inv.status].tone}`}>
                <Icon name={RUN_STATUS[inv.status].icon} size={22} />
                <span>{NO_VERDICT[inv.status].title}</span>
              </p>
              <p className="readout-sub">{NO_VERDICT[inv.status].text}</p>
              {fatal && (
                <p className="readout-sub">
                  <EvidenceLink id={fatal.stepId}>
                    Error in {fatal.stage}: {fatal.message}
                  </EvidenceLink>
                </p>
              )}
            </>
          )}
        </div>
        <div className="cell">
          <p className="kicker">Sandbox runs</p>
          <p className="readout-value">{inv.experiments.length}</p>
          <p className="readout-sub">{scope(inv)}</p>
          <p className="readout-split">
            <span className="tone-text-ok">{passed} passed</span>
            <span className={failed ? 'tone-text-fail' : 'muted'}>{failed} failed</span>
            {unfinished > 0 && <span className="tone-text-warn">{unfinished} unfinished</span>}
          </p>
        </div>
        <div className="cell">
          <p className="kicker">Execution</p>
          <p className="readout-text">
            {inv.status === 'complete' ? 'Run complete' : inv.status === 'running' ? 'Trace incomplete' : RUN_STATUS[inv.status].label}
          </p>
          <p className="readout-sub">Whether the run itself finished; separate from the verdict.</p>
        </div>
        <div className="cell">
          <p className="kicker">Explanation review</p>
          {review ? (
            <p className={`readout-text tone-text-${review.tone}`}>
              <Icon name={review.icon} size={15} /> {review.label}
            </p>
          ) : (
            <p className="readout-text muted">Not reviewed</p>
          )}
          <p className="readout-sub">A second model checks the explanation's claims. It does not change the verdict.</p>
        </div>
      </section>

      <div className="bench">
        <DependencyMap inv={inv} experimentId={experimentId} onExperiment={setExperimentId} />
      </div>

      <div className="bench">
        <Instrument inv={inv} selectedId={experimentId} onSelect={setExperimentId} />
        <a className="bench-link" href={at('experiments')}>
          Every observation, check, setting and log <Icon name="arrow-right" size={14} />
        </a>
      </div>

      <div className="bench bench-3">
        <section className="cell" aria-labelledby="explain-title">
          <p className="kicker">The model's explanation</p>
          {v ? (
            <>
              <h2 id="explain-title" className="explain-headline">
                {v.headline}
              </h2>
              <p className="readout-sub">Written by the model and checked by a second model. It explains the result; it does not decide it.</p>
              {v.cause && (
                <details className="more">
                  <summary>Full explanation</summary>
                  <p>{v.cause}</p>
                </details>
              )}
              {v.wordingNote && (
                <p className="callout tone-warn">
                  <Icon name="alert" size={15} /> {v.wordingNote}
                </p>
              )}
            </>
          ) : (
            <p id="explain-title" className="muted">
              No explanation without a verdict.
            </p>
          )}
        </section>

        <section className="cell" aria-labelledby="uncertain-title">
          <p className="kicker" id="uncertain-title">
            What remains uncertain
          </p>
          {v?.verdict === 'no_failure_observed' && (
            <p className="callout tone-neutral">
              <Icon name="info" size={15} /> This is not a guarantee the change is fine in production: only these conditions were
              tested.
            </p>
          )}
          {v && v.limitations.length > 0 ? (
            <ul className="plain-bullets">
              {v.limitations.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">No limitations were recorded with this result.</p>
          )}
          {openHyps.length > 0 && (
            <p className="readout-sub">
              {plural(openHyps.length, 'hypothesis')} left {[...new Set(openHyps.map((h) => HYPOTHESIS[h.status].label.toLowerCase()))].join(', ')}:{' '}
              {openHyps.map((h, i) => (
                <span key={h.id}>
                  {i > 0 && ', '}
                  <EvidenceLink id={h.id}>{h.id}</EvidenceLink>
                </span>
              ))}
            </p>
          )}
          {inv.review && inv.review.issues.length > 0 && (
            <div className="review-issues">
              <p className="callout tone-warn">
                <Icon name="alert" size={15} /> The reviewer{inv.review.reviewerModel && <> ({shortModel(inv.review.reviewerModel)})</>} found{' '}
                {plural(inv.review.issues.length, 'claim')} in the explanation without supporting evidence. The verdict still stands;
                it comes from the experiments.
              </p>
              <ul className="plain-bullets">
                {inv.review.issues.map((i, n) => (
                  <li key={n}>
                    “{i.statement}” <span className="muted">{i.problem}</span> <Refs refs={i.refs} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {inv.warnings.length > 0 && (
            <details className="more">
              <summary>{plural(inv.warnings.length, 'data warning')} in this trace</summary>
              <ul className="plain-bullets">
                {inv.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="cell" aria-labelledby="mitigation-title">
          <p className="kicker" id="mitigation-title">
            {v?.mitigation ? 'Suggested mitigation' : 'What was tested'}
          </p>
          {v?.mitigation && (
            <>
              <p className="tag-unverified">
                <Icon name="help-circle" size={14} /> Unverified suggestion from the model
              </p>
              <p className="mitigation-text">{v.mitigation}</p>
              <p className="readout-sub">Domino has not tested this change.</p>
            </>
          )}
          {v && v.tested.length > 0 &&
            (v.mitigation ? (
              <details className="more">
                <summary>What was tested</summary>
                <ul className="plain-bullets small">
                  {v.tested.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </details>
            ) : (
              <ul className="plain-bullets small">
                {v.tested.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            ))}
          {!v?.mitigation && (!v || v.tested.length === 0) && <p className="muted">Nothing recorded.</p>}
        </section>
      </div>
    </div>
  )
}

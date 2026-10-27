// PR comment: what an engineer would meet on the pull request. A check row
// and one short comment that leads with the same plain answer as the Summary,
// then the numbers, the path and the fix. "Copy as Markdown" gives the exact
// comment text to paste; nothing is posted from here.

import { fixLine } from '../../fix'
import { isNemotron, REVIEW_OUTCOME, VERDICT } from '../../../lib/labels'
import { href } from '../../../lib/router'
import { experimentSummary } from '../../../lib/showcase'
import type { Investigation } from '../../../types'
import { fmtValue } from '../../derive'
import { DIcon } from '../../icons'
import { LogoMark } from '../../../components/LogoMark'
import { humanize, More, useCopy } from '../../ui'
import { outcomeText } from './Answer'
import { buildFlow } from './Flow'

const ICON = { reproduced_failure: 'x-circle', no_failure_observed: 'minus-circle', inconclusive: 'help-circle' } as const

/** The comment as Markdown, built from the same fields the preview shows. */
function markdown(inv: Investigation, reportUrl: string): string {
  if (!inv.verdict) return `**Domino:** the investigation ended before a verdict. [Open the run](${reportUrl})`
  const t = outcomeText(inv)
  const x = experimentSummary(inv)
  const path = buildFlow(inv).map((s) => (s.state === 'change' ? 'the change' : `\`${s.name}\``))
  const nemo = inv.receipts.filter((r) => r.routedModel && isNemotron(r.routedModel)).length
  const review = inv.review ? REVIEW_OUTCOME[inv.review.outcome].label.toLowerCase() : null
  const lines = [`### ${VERDICT[inv.verdict.verdict].label}: ${t.title}`, '', t.sub, '']
  if (x) {
    lines.push(
      `| | Without the change | With the change | Change reverted |${x.limit?.value != null ? ' Limit |' : ''}`,
      `|---|---|---|---|${x.limit?.value != null ? '---|' : ''}`,
      `| ${humanize(x.key).name} | ${fmtValue(x.baseline)} | **${fmtValue(x.candidate)}** | ${fmtValue(x.control)} |${x.limit?.value != null ? ` ${fmtValue(x.limit.value)} |` : ''}`,
      '',
    )
  }
  if (path.length > 1) lines.push(`**Path:** ${path.join(' → ')}`, '')
  if (inv.verdict.mitigation)
    lines.push(`<details><summary>Suggested fix (${fixLine(inv).toLowerCase()})</summary>`, '', inv.verdict.mitigation, '', '</details>', '')
  lines.push(
    `<sub>Decided by Domino’s judge from ${inv.experiments.length} sandbox runs${review ? ` · ${review}` : ''} · ${nemo} of ${inv.receipts.length} model calls on Nemotron · [Full report](${reportUrl})</sub>`,
  )
  return lines.join('\n')
}

export function PrTab({ inv, runParam }: { inv: Investigation; runParam: string | null }) {
  const [copied, copy] = useCopy()
  const v = inv.verdict ? VERDICT[inv.verdict.verdict] : null
  const t = inv.verdict ? outcomeText(inv) : null
  const x = experimentSummary(inv)
  const steps = buildFlow(inv)
  const nemo = inv.receipts.filter((r) => r.routedModel && isNemotron(r.routedModel)).length
  const review = inv.review ? REVIEW_OUTCOME[inv.review.outcome] : null
  const report = href.case(inv.caseId, { runId: runParam })
  const reportUrl = `${window.location.origin}${window.location.pathname}${report}`
  const pr = inv.change?.pullRequest ?? null

  return (
    <div className="dx-stack">
      <div className="dx-gh">
        <div className="dx-pr-bar">
          <span className="dx-faint">
            {pr ? (
              <>
                The comment for{' '}
                <a className="dx-link" href={pr.url} target="_blank" rel="noreferrer">
                  {pr.repo} #{pr.number}
                </a>
                {inv.reportMd ? ', as the agent wrote it in report.md.' : '.'} Nothing is sent from here.
              </>
            ) : (
              'Preview of what Domino would post on the pull request. Nothing is sent from here.'
            )}
          </span>
          <button type="button" className="dx-btn dx-btn-sm" onClick={() => copy(inv.reportMd ?? markdown(inv, reportUrl))}>
            <DIcon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'Copied' : 'Copy as Markdown'}
          </button>
        </div>

        {/* The check, as it appears in the PR's checks list */}
        <div className="dx-gh-check">
          <span className={`dx-gh-icon tone-${v?.tone ?? 'muted'}`}>
            <DIcon name={inv.verdict ? ICON[inv.verdict.verdict] : 'clock'} size={16} />
          </span>
          <b>Domino / investigation</b>
          <span className="dx-faint">{v ? v.label : 'No verdict yet'}</span>
          <a className="dx-link-quiet" href={report} style={{ marginLeft: 'auto' }}>
            Details
          </a>
        </div>

        {/* The comment */}
        <div className="dx-gh-comment">
          <div className="dx-gh-head">
            <span className="dx-gh-avatar" aria-hidden="true">
              <LogoMark size={13} />
            </span>
            <b>Domino</b>
            <span className="dx-gh-bot">bot</span>
            <span className="dx-faint">commented on {pr ? `#${pr.number}` : (inv.change?.changeId ?? 'this change')}</span>
          </div>

          <div className="dx-gh-body">
            {!inv.verdict || !t ? (
              <p>The investigation ended before a verdict, so there is nothing to report yet.</p>
            ) : (
              <>
                <h3 className={`tone-${v!.tone}`}>
                  <DIcon name={ICON[inv.verdict.verdict]} size={16} />
                  {t.title}
                </h3>
                <p>{t.sub}</p>

                {x && (
                  <table className="dx-gh-table">
                    <thead>
                      <tr>
                        <th />
                        <th>Without the change</th>
                        <th>With the change</th>
                        <th>Change reverted</th>
                        {x.limit?.value != null && <th>Limit</th>}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="dx-gh-metric" title={x.key}>
                          {humanize(x.key).name}
                        </td>
                        <td>{fmtValue(x.baseline)}</td>
                        <td className={x.candidateFailed ? 'is-bad' : undefined}>
                          <b>{fmtValue(x.candidate)}</b>
                        </td>
                        <td>{fmtValue(x.control)}</td>
                        {x.limit?.value != null && <td>{fmtValue(x.limit.value)}</td>}
                      </tr>
                    </tbody>
                  </table>
                )}

                {steps.length > 1 && (
                  <p className="dx-gh-path">
                    <b>Path</b>{' '}
                    {steps.map((s, i) => (
                      <span key={s.id}>
                        {i > 0 && <span className="dx-faint"> → </span>}
                        {s.state === 'change' ? 'the change' : <code className={s.state === 'broken' ? 'is-bad' : undefined}>{s.name}</code>}
                      </span>
                    ))}
                  </p>
                )}

                {inv.verdict.mitigation && (
                  <details className="dx-gh-details">
                    <summary>
                      Suggested fix <span className="dx-faint">({fixLine(inv).toLowerCase()})</span>
                    </summary>
                    <p>{inv.verdict.mitigation}</p>
                  </details>
                )}

                <p className="dx-gh-foot">
                  Decided by Domino’s judge from {inv.experiments.length} sandbox runs
                  {review ? ` · ${review.label.toLowerCase()}` : ''} · {nemo} of {inv.receipts.length} model calls on Nemotron ·{' '}
                  <a className="dx-link" href={report}>
                    Full report
                  </a>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
      {inv.reportMd && (
        <More summary="Markdown, as written in report.md">
          <pre className="dx-pre">{inv.reportMd}</pre>
        </More>
      )}
    </div>
  )
}

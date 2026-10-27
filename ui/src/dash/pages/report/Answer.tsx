// The top of the report: the verdict once, the measurement that decided it
// as a picture, and the few facts that say how far to trust it. Everything
// else on the Summary tab is one click away.

import { isNemotron, VERDICT, VERDICT_RULE } from '../../../lib/labels'
import { href } from '../../../lib/router'
import { chainTiles, experimentSummary, type ExperimentSummary } from '../../../lib/showcase'
import type { CaseEntry, Investigation } from '../../../types'
import { agreement, brokenComponent, componentRoles, fmtValue, roleFor } from '../../derive'
import { DIcon } from '../../icons'
import { humanize, Info, Pips, Status, VERDICT_SHORT } from '../../ui'

export function MeasureBars({ x }: { x: ExperimentSummary }) {
  const metric = humanize(x.key)
  const rows = [
    { label: 'Without the change', value: x.baseline, fail: false },
    { label: 'With the change', value: x.candidate, fail: x.candidateFailed },
    { label: 'Change reverted', value: x.control, fail: false },
  ].filter((r) => r.value != null)
  const limit = x.limit?.value ?? null
  const numeric = rows.every((r) => typeof r.value === 'number')
  const max = numeric ? Math.max(...rows.map((r) => r.value as number), limit ?? 0) * 1.12 || 1 : 1
  const at = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`

  return (
    <figure className="dx-measure" aria-label={`${metric.name}: ${rows.map((r) => `${r.label} ${fmtValue(r.value)}`).join(', ')}${limit != null ? `, limit ${limit}` : ''}`}>
      <div className="dx-measure-rows">
        {rows.map((r) => (
          <div key={r.label} className={`dx-measure-row${r.fail ? ' is-fail' : ''}`}>
            <span className="dx-measure-label">{r.label}</span>
            <span className="dx-measure-track">
              {numeric ? <span className="dx-measure-bar" style={{ width: at(r.value as number) }} /> : null}
              {numeric && limit != null && <span className="dx-measure-limit" style={{ left: at(limit) }} />}
            </span>
            <span className="dx-measure-value">{fmtValue(r.value)}</span>
          </div>
        ))}
        {numeric && limit != null && (
          <div className="dx-measure-row dx-measure-axis" aria-hidden="true">
            <span />
            <span className="dx-measure-track">
              <span className="dx-measure-limit-label" style={{ left: at(limit) }}>
                Limit {fmtValue(limit)}
              </span>
            </span>
            <span />
          </div>
        )}
      </div>
    </figure>
  )
}

/** The headline as plain text: what happens, in words. The verdict is the judge's; this only restates it. */
export function outcomeText(inv: Investigation): { title: string; sub: string; check: string | null } {
  const verdict = inv.verdict!.verdict
  if (verdict === 'no_failure_observed')
    return { title: 'No failure found under these tests', sub: 'Every check that passed without the change also passed with it.', check: null }
  if (verdict === 'inconclusive')
    return { title: 'Domino could not decide', sub: 'The sandbox runs didn’t give the judge enough to call it either way.', check: null }
  const comp = brokenComponent(inv)
  const x = experimentSummary(inv)
  const check = x?.failure ? humanize(x.failure.split(':')[0]).name.toLowerCase() : null
  return {
    title: comp ? `This change breaks ${comp}` : 'This change breaks something downstream',
    sub: check
      ? `With the change, the check “${check}” fails. Undoing the change makes it pass again.`
      : 'With the change a check fails. Undoing the change makes it pass again.',
    check,
  }
}

/** The headline with the failing check emphasised. */
function headline(inv: Investigation): { title: string; sub: React.ReactNode } {
  const t = outcomeText(inv)
  if (!t.check) return { title: t.title, sub: t.sub }
  return {
    title: t.title,
    sub: (
      <>
        With the change, the check <b>“{t.check}”</b> fails. Undoing the change makes it pass again.
      </>
    ),
  }
}

const VERDICT_ICON = { reproduced_failure: 'x-circle', no_failure_observed: 'minus-circle', inconclusive: 'help-circle' } as const

function Fact({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export function Answer({ inv, caseEntry, runParam }: { inv: Investigation; caseEntry: CaseEntry; runParam: string | null }) {
  const a = agreement(caseEntry)
  const x = experimentSummary(inv)
  const calls = inv.receipts.length
  const nemo = inv.receipts.filter((r) => r.routedModel && isNemotron(r.routedModel)).length
  const flagged = inv.review?.issues.length ?? 0
  const at = (section: string) => href.case(inv.caseId, { runId: runParam, section })

  if (!inv.verdict) {
    const running = inv.status === 'running'
    const lastError = inv.errors[inv.errors.length - 1]
    return (
      <section className="dx-answer">
        <div className="dx-answer-main">
          <div className="dx-answer-head">
            <span className={`dx-answer-icon tone-${running ? 'accent' : 'muted'}`}>
              <DIcon name="clock" size={20} />
            </span>
            <div>
              <h2 className="dx-answer-headline">{running ? 'Investigation in progress' : 'No verdict recorded'}</h2>
              <p className="dx-muted">
                {running ? 'This page fills in as the agent writes the run.' : (lastError?.message ?? 'The run ended before the judge could decide.')}
              </p>
            </div>
          </div>
        </div>
      </section>
    )
  }

  const v = VERDICT[inv.verdict.verdict]
  const h = headline(inv)
  const review = inv.review?.outcome
  return (
    <section className="dx-answer">
      <div className="dx-answer-main">
        <div className="dx-answer-head">
          <span className={`dx-answer-icon tone-${v.tone}`}>
            <DIcon name={VERDICT_ICON[inv.verdict.verdict]} size={22} />
          </span>
          <div>
            <h2 className="dx-answer-headline">{h.title}</h2>
            <p className="dx-muted">{h.sub}</p>
          </div>
        </div>

        <dl className="dx-facts">
          <Fact
            label={
              <>
                Verdict
                <Info label="How this verdict is decided">
                  {VERDICT_RULE[inv.verdict.verdict]} A deterministic judge decides from the sandbox runs; the model never sets the verdict.
                </Info>
              </>
            }
          >
            <Status tone={v.tone}>{VERDICT_SHORT[inv.verdict.verdict]}</Status>
          </Fact>
          {a.decided > 0 && (
            <Fact label="Repeats">
              <span className="dx-row" style={{ gap: 8 }}>
                <Pips verdicts={a.verdicts} />
                {a.decided === 1 ? '1 run' : a.agreeing === a.decided ? `${a.decided} of ${a.decided} agree` : `${a.agreeing} of ${a.decided} agree`}
              </span>
            </Fact>
          )}
          <Fact label="Explanation">
            {review === 'approved' ? (
              <Status tone="ok">Approved by reviewer</Status>
            ) : review === 'flagged' || review === 'sent_back' ? (
              <Status tone="warn">
                {flagged || 'Some'} claim{flagged === 1 ? '' : 's'} flagged
              </Status>
            ) : (
              <span className="dx-faint">Not reviewed</span>
            )}
          </Fact>
          {calls > 0 && (
            <Fact label="Model calls">
              {nemo === calls ? `${calls}, all Nemotron` : `${nemo} of ${calls} Nemotron`}
            </Fact>
          )}
        </dl>
      </div>

      {x && (
        <div className="dx-answer-section">
          <div className="dx-answer-section-h">
            <span>
              <b title={x.key}>{humanize(x.key).name}</b>
              {humanize(x.key).scope && <span className="dx-faint"> · {humanize(x.key).scope}</span>}
            </span>
            <a className="dx-link-quiet" href={at('experiments')}>
              All experiments <DIcon name="arrow-right" size={12} />
            </a>
          </div>
          <MeasureBars x={x} />
        </div>
      )}
    </section>
  )
}

/** What a step on the path is: its own description, or for a setting, whose setting it is. */
function stepRole(t: { label: string; kind: string }, roles: Map<string, string>): string | null {
  if (roles.has(t.label)) return roles.get(t.label)!
  const owner = t.label.split(/[.:]/)[0]
  if (t.kind === 'setting' || t.kind === 'limit') return owner !== t.label && roles.has(owner) ? `${t.kind === 'limit' ? 'Limit' : 'Setting'} of ${owner}` : null
  return roleFor(t.label, roles)
}

/** The path from the change to what broke, one short step per component. */
export function ChainStrip({ inv }: { inv: Investigation }) {
  const tiles = chainTiles(inv)
  const roles = componentRoles(inv)
  if (tiles.length < 2) return null
  return (
    <ol className="dx-strip" aria-label="Path from the change to the failure">
      {tiles.map((t, i) => (
        <li key={t.id} className={t.link?.status === 'inferred' ? 'is-inferred' : undefined}>
          {i > 0 && (
            <span className="dx-strip-link" title={`${t.link?.relation} · ${t.link?.status}`}>
              <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true">
                <path d="M0 5h15M11 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray={t.link?.status === 'inferred' ? '3 2' : undefined} />
              </svg>
            </span>
          )}
          <span
            className={`dx-strip-node${t.kind === 'change' ? ' is-change' : ''}${i === tiles.length - 1 ? ' is-end' : ''}`}
            title={t.kind === 'change' ? undefined : (stepRole(t, roles) ?? t.kind)}
          >
            <span className="dx-strip-name">{t.kind === 'change' ? 'The change' : t.label}</span>
            {t.kind !== 'change' && stepRole(t, roles) && <span className="dx-strip-role">{stepRole(t, roles)}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

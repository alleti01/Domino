import { useState } from 'react'
import type { CaseEntry, Investigation } from '../../types'
import type { SiteState } from '../../data/useSite'
import { LINK_STATUS, VERDICT } from '../../lib/labels'
import { href } from '../../lib/router'
import { summarizeRuns } from '../../lib/runs'
import { keyObservation, stepStatuses, type StepState } from '../../lib/steps'
import { Badge } from '../common'
import { Icon, type IconName } from '../Icon'

const STEP_ICON: Record<StepState, { icon: IconName; tone: string; label: string }> = {
  done: { icon: 'check-circle', tone: 'ok', label: 'done' },
  failed: { icon: 'x-circle', tone: 'fail', label: 'found a failure' },
  warn: { icon: 'help-circle', tone: 'warn', label: 'unclear' },
  pending: { icon: 'clock', tone: 'muted', label: 'in progress' },
  skipped: { icon: 'minus-circle', tone: 'muted', label: 'skipped' },
}

interface Showcase {
  caseEntry: CaseEntry
  inv: Investigation
}

/** Cases whose latest run loaded, flagship (first) first. */
function showcases(cases: CaseEntry[]): Showcase[] {
  return cases.flatMap((c) => {
    const r = c.runs[0]
    return r?.load.ok ? [{ caseEntry: c, inv: r.load.investigation }] : []
  })
}

/** The product window in the hero: one real investigation at a glance. */
export function HeroPreview({ state }: { state: SiteState }) {
  const [index, setIndex] = useState(0)

  if (state.status !== 'ready') {
    return (
      <div className="preview-window preview-empty" role="status">
        {state.status === 'loading' ? 'Loading an investigation…' : 'The preview could not load.'}
      </div>
    )
  }
  const items = showcases(state.site.cases).slice(0, 4)
  if (items.length === 0) {
    return <div className="preview-window preview-empty">No investigations saved yet.</div>
  }
  const { caseEntry, inv } = items[Math.min(index, items.length - 1)]
  const sum = summarizeRuns(caseEntry)
  const v = inv.verdict ? VERDICT[inv.verdict.verdict] : null
  const obs = keyObservation(inv)
  const links = inv.chain.causal.length
    ? inv.chain.causal.map((l) => ({ text: l.edge ? `${l.edge.from} → ${l.edge.to}` : l.text, relation: l.edge?.relation, status: l.status }))
    : inv.chain.edges.slice(0, 3).map((e) => ({ text: `${e.from} → ${e.to}`, relation: e.relation, status: e.status }))

  return (
    <figure className="preview-window" aria-label={`Preview: Domino's investigation of the ${caseEntry.label} case`}>
      {items.length > 1 && (
        <div className="preview-tabs" role="tablist" aria-label="Cases">
          {items.map((it, i) => (
            <button
              key={it.caseEntry.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              className="preview-tab"
              onClick={() => setIndex(i)}
            >
              {it.caseEntry.label}
            </button>
          ))}
        </div>
      )}

      <div className="preview-head">
        <span className="brand-mark small-mark" aria-hidden="true">
          <span />
          <span />
        </span>
        <strong>Run on {caseEntry.label}</strong>
        <span className="muted small">
          {sum.total} {sum.total === 1 ? 'run' : 'runs'}
        </span>
        <span className="preview-head-right">
          {state.site.isPlaceholder && <Badge tone="warn">Placeholder data</Badge>}
          {inv.replay ? <Badge tone="muted">Replay</Badge> : <Badge tone="accent">Live run</Badge>}
        </span>
      </div>

      <div className="preview-body">
        <ol className="preview-steps" aria-label="Investigation steps">
          {stepStatuses(inv).map(({ step, state: st, detail }) => {
            const s = STEP_ICON[st]
            return (
              <li key={step.key} className={`preview-step state-${st}`}>
                <span className={`tone-text-${s.tone}`}>
                  <Icon name={s.icon} size={16} />
                </span>
                <span>
                  <strong>{step.title}</strong>
                  <span className="visually-hidden">: {s.label}.</span>
                  <span className="preview-step-detail">{detail}</span>
                </span>
              </li>
            )
          })}
        </ol>

        <div className="preview-detail">
          <h3 className="small">How the change reaches what broke</h3>
          {links.length === 0 ? (
            <p className="small muted">No dependency path in this run.</p>
          ) : (
            <ol className="preview-chain">
              {links.map((l, i) => (
                <li key={i}>
                  <code>{l.text}</code>
                  {l.relation && <span className="muted small"> {l.relation.replace(/_/g, ' ')}</span>}{' '}
                  <span className="small muted">({LINK_STATUS[l.status].label.toLowerCase()})</span>
                </li>
              ))}
            </ol>
          )}

          {obs && (
            <>
              <h3 className="small">Experiment</h3>
              <p className="preview-obs">
                <code>{obs.key}</code>: baseline <strong>{String(obs.baseline ?? '—')}</strong> → candidate{' '}
                <strong>{String(obs.candidate ?? '—')}</strong>
              </p>
            </>
          )}

          {v && inv.verdict && (
            <div className={`preview-callout tone-${v.tone}`}>
              <span className="preview-callout-label">
                <Icon name={v.icon} size={14} /> {v.label}
              </span>
              <p>{inv.verdict.headline}</p>
            </div>
          )}

          <a className="small preview-open" href={href.case(caseEntry.id)}>
            Open the full investigation →
          </a>
        </div>
      </div>
    </figure>
  )
}

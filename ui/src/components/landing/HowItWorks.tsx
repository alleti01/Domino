import { useEffect, useRef, useState } from 'react'
import type { Showcase } from '../../lib/showcase'
import { STEPS, type Step } from '../../content'
import { ARM_OUTCOME, ARM_ROLE, HYPOTHESIS, LINK_STATUS, VERDICT, shortModel } from '../../lib/labels'
import { href } from '../../lib/router'
import { scrollToSection } from '../../lib/scroll'
import { Badge } from '../common'
import { Icon } from '../Icon'
import { DiffBlock } from '../investigation/ChangeSection'
import { ArrowLink } from './Motion'
import { TourSection } from './Tour'

/** What each step looks like in the flagship run. */
function StepBody({ step, show }: { step: Step; show: Showcase }) {
  const { inv } = show
  switch (step.key) {
    case 'change':
      return inv.change ? (
        <>
          <p className="how-strong">{inv.change.title}</p>
          {inv.change.description && <p className="how-muted">{inv.change.description}</p>}
          {inv.change.diff && <DiffBlock diff={inv.change.diff} />}
        </>
      ) : (
        <p className="how-muted">Not recorded in this run.</p>
      )
    case 'connect': {
      const sources = new Set(inv.chain.edges.flatMap((e) => e.refs.map((r) => r.source)))
      return (
        <>
          <p className="how-strong">
            {inv.chain.edges.length} links across {sources.size} sources
          </p>
          <ul className="how-list">
            {inv.chain.edges.slice(0, 5).map((e, i) => (
              <li key={i}>
                <code>{e.from}</code> <span className="how-muted">{e.relation.replace(/_/g, ' ')}</span> <code>{e.to}</code>{' '}
                <Badge tone={LINK_STATUS[e.status].tone}>{LINK_STATUS[e.status].label}</Badge>
                <span className="how-source">{e.refs.map((r) => r.source).join(', ')}</span>
              </li>
            ))}
          </ul>
          {inv.chain.dqIssues.length > 0 && (
            <p className="how-muted small">{inv.chain.dqIssues.length} rows rejected by data-quality rules, shown in the report.</p>
          )}
        </>
      )
    }
    case 'suspect': {
      const model = inv.receipts.find((r) => r.routedModel)?.routedModel
      return (
        <>
          {inv.hypotheses.slice(0, 2).map((h) => (
            <div key={h.id} className="how-hyp">
              <Badge tone={HYPOTHESIS[h.status].tone} icon={HYPOTHESIS[h.status].icon}>
                {HYPOTHESIS[h.status].label}
              </Badge>
              <p>{h.claim}</p>
            </div>
          ))}
          {model && (
            <p className="how-muted small">
              Reasoned by <code>{shortModel(model)}</code> through Meterless Nightshift.
            </p>
          )}
        </>
      )
    }
    case 'test':
      return (
        <ul className="how-list">
          {inv.experiments.map((x) => {
            const o = ARM_OUTCOME[x.outcome]
            const failed = x.assertions.find((a) => !a.passed)
            return (
              <li key={x.id}>
                <strong>{ARM_ROLE[x.variant]}</strong>{' '}
                <Badge tone={o.tone} icon={o.icon}>
                  {x.completed ? o.label : 'Did not finish'}
                </Badge>
                {failed && <span className="how-source">{failed.name}</span>}
              </li>
            )
          })}
          {inv.experiments.length === 0 && <li className="how-muted">No experiments in this run.</li>}
        </ul>
      )
    case 'conclude': {
      if (!inv.verdict) return <p className="how-muted">No verdict yet.</p>
      const v = VERDICT[inv.verdict.verdict]
      return (
        <>
          <p className={`how-verdict tone-text-${v.tone}`}>
            <Icon name={v.icon} size={18} /> {v.label}
          </p>
          <p>{inv.verdict.headline}</p>
          <p className="how-muted small">
            Decided by a rule-based judge, not the AI. {inv.verdict.limitations[0] && `Limit noted: ${inv.verdict.limitations[0]}`}
          </p>
        </>
      )
    }
  }
}

/** Five steps on the left stay in view while the right scrolls through them in a real run. */
export function HowItWorks({ show, placeholder }: { show: Showcase | null; placeholder: boolean }) {
  const [active, setActive] = useState<Step['key']>('change')
  const panels = useRef<Map<string, HTMLElement>>(new Map())

  useEffect(() => {
    if (!show || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.getAttribute('data-step') as Step['key'])
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    panels.current.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [show])

  return (
    <TourSection
      id="how"
      number="03"
      kicker="How it works"
      title="Five steps,"
      titleTail="one investigation."
      lede="Scroll through a real run. Each step names the technology behind it and links to that part of the report."
      placeholder={placeholder}
    >
      {!show ? (
        <p className="tour-empty">The steps appear here once a run is saved.</p>
      ) : (
        <div className="how-grid">
          <ol className="how-steps" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s.key}>
                <button
                  type="button"
                  className="how-step"
                  aria-current={active === s.key ? 'step' : undefined}
                  onClick={() => scrollToSection(`how-${s.key}`, { smooth: true })}
                >
                  <span className="how-num">{i + 1}</span>
                  <span>
                    <span className="how-step-title">{s.title}</span>
                    <span className="how-step-tech">{s.tech}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="how-panels">
            {STEPS.map((s, i) => (
              <article
                key={s.key}
                id={`how-${s.key}`}
                data-step={s.key}
                ref={(el) => {
                  if (el) panels.current.set(s.key, el)
                }}
                className={`how-panel${active === s.key ? ' active' : ''}`}
                aria-labelledby={`how-${s.key}-title`}
              >
                <p className="how-panel-kicker">
                  Step {i + 1} · <span className="how-step-tech">{s.tech}</span>
                </p>
                <h3 id={`how-${s.key}-title`} className="how-panel-title">
                  <Icon name={s.icon} size={18} /> {s.title}
                </h3>
                <p className="how-muted">{s.text}</p>
                <div className="how-body">
                  <StepBody step={s} show={show} />
                </div>
                <ArrowLink className="how-link" href={href.case(show.caseEntry.id, { section: s.section })}>
                  See this step in the report
                </ArrowLink>
              </article>
            ))}
          </div>
        </div>
      )}
    </TourSection>
  )
}

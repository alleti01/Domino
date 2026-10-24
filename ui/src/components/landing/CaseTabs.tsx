import { useRef, useState, type KeyboardEvent } from 'react'
import type { CaseEntry } from '../../types'
import { CASE_KIND, VERDICT } from '../../lib/labels'
import { href } from '../../lib/router'
import { plural, summarizeRuns } from '../../lib/runs'
import { experimentSummary } from '../../lib/showcase'
import { Badge } from '../common'
import { TourSection } from './Tour'

/** One engine, every case: tabs that show each case's verdict and its key number. */
export function CaseTabs({ cases, placeholder }: { cases: CaseEntry[]; placeholder: boolean }) {
  const [index, setIndex] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const current = cases[Math.min(index, cases.length - 1)]

  // Arrow keys move between tabs, as screen-reader users expect from a tab list.
  const onKey = (e: KeyboardEvent) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? cases.length - 1 : (index + delta + cases.length) % cases.length
    if (!delta && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    setIndex(to)
    tabs.current[to]?.focus()
  }

  const latest = current?.runs[0]
  const inv = latest?.load.ok ? latest.load.investigation : null
  const v = inv?.verdict ? VERDICT[inv.verdict.verdict] : null
  const sum = current ? summarizeRuns(current) : null
  const exp = inv ? experimentSummary(inv) : null

  return (
    <TourSection
      id="cases"
      kicker="Cases"
      title="Same engine, different failures."
      lede="Every case runs through the same investigation, including a safe change that should raise no alarm."
      placeholder={placeholder}
      link={{ href: href.cases, label: 'All cases in the dashboard' }}
    >
      {!current ? (
        <p className="tour-empty">Cases appear here once runs are saved.</p>
      ) : (
        <div className="case-tabs">
          <div className="case-tablist" role="tablist" aria-label="Cases" onKeyDown={onKey}>
            {cases.map((c, i) => (
              <button
                key={c.id}
                ref={(el) => {
                  tabs.current[i] = el
                }}
                type="button"
                role="tab"
                id={`case-tab-${c.id}`}
                aria-selected={i === index}
                aria-controls="case-panel"
                tabIndex={i === index ? 0 : -1}
                className="case-tab"
                onClick={() => setIndex(i)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="case-panel" role="tabpanel" id="case-panel" aria-labelledby={`case-tab-${current.id}`}>
            <p className="how-muted">{CASE_KIND[current.kind]}</p>
            {v ? (
              <p className={`case-verdict tone-text-${v.tone}`}>{v.label}</p>
            ) : (
              <p className="case-verdict how-muted">No verdict yet</p>
            )}
            {inv?.verdict && <p className="case-headline">{inv.verdict.headline}</p>}
            {current.kind === 'safe' && inv?.verdict?.verdict === 'no_failure_observed' && (
              <Badge tone="neutral">No false alarm on a safe change</Badge>
            )}
            {exp && (
              <p className="case-number">
                <code>{exp.key}</code>: baseline <strong>{String(exp.baseline ?? '—')}</strong> → candidate{' '}
                <strong>{String(exp.candidate ?? '—')}</strong>
              </p>
            )}
            {sum && (
              <p className="how-muted small">
                {plural(sum.total, 'Domino run')}
                {sum.decided > 0 && sum.matching != null && ` · ${sum.matching} of ${sum.decided} match the expected verdict`}
              </p>
            )}
            <p className="case-links">
              <a className="btn btn-muted" href={href.case(current.id)}>
                Open the report
              </a>
              <a className="btn btn-muted" href={href.case(current.id, { view: 'pr' })}>
                See the PR comment
              </a>
            </p>
          </div>
        </div>
      )}
    </TourSection>
  )
}

import type { CaseEntry } from '../../types'
import { CASE_KIND, VERDICT } from '../../lib/labels'
import { href } from '../../lib/router'
import { experimentSummary } from '../../lib/showcase'
import { Arrow } from './Motion'
import { TourSection } from './Tour'

/** Every case as one row of an index: name, verdict, the number that moved, and links. */
export function CaseIndex({ cases, placeholder }: { cases: CaseEntry[]; placeholder: boolean }) {
  return (
    <TourSection
      id="cases"
      number="04"
      kicker="Cases"
      title="Same engine,"
      titleTail="different failures."
      lede="Every case runs through the same investigation, including safe changes that should raise no alarm."
      placeholder={placeholder}
      link={{ href: href.cases, label: 'All cases in the dashboard' }}
    >
      {cases.length === 0 ? (
        <p className="tour-empty">Cases appear here once runs are saved.</p>
      ) : (
        <ol className="case-index">
          {cases.map((c) => {
            const run = c.runs[0]
            const inv = run?.load.ok ? run.load.investigation : null
            const v = inv?.verdict ? VERDICT[inv.verdict.verdict] : null
            const exp = inv ? experimentSummary(inv) : null
            return (
              <li key={c.id} className={`case-row tone-${v?.tone ?? 'muted'}`}>
                <div className="case-row-main">
                  <a className="case-row-title" href={href.case(c.id)}>
                    {/* The arrow stays on the line of the last word. */}
                    {c.label.slice(0, c.label.lastIndexOf(' ') + 1)}
                    <span className="nowrap">
                      {c.label.slice(c.label.lastIndexOf(' ') + 1)}
                      <Arrow />
                    </span>
                  </a>
                  <span className="case-row-kind">{CASE_KIND[c.kind]}</span>
                </div>
                <span className="case-row-verdict">
                  <span className="case-row-dot" aria-hidden="true" />
                  {v ? v.label : 'No verdict yet'}
                </span>
                <span className="case-row-number">
                  {exp ? (
                    <>
                      <code>{exp.key}</code> {String(exp.baseline ?? '—')} → {String(exp.candidate ?? '—')}
                    </>
                  ) : (
                    '—'
                  )}
                </span>
                <a className="case-row-pr" href={href.case(c.id, { view: 'pr' })}>
                  PR comment<span className="visually-hidden"> for {c.label}</span>
                </a>
              </li>
            )
          })}
        </ol>
      )}
    </TourSection>
  )
}

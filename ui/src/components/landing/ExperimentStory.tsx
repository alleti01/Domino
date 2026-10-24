import type { CSSProperties } from 'react'
import type { Showcase } from '../../lib/showcase'
import { experimentSummary } from '../../lib/showcase'
import { href } from '../../lib/router'
import { useInView } from '../../hooks/useInView'
import { Icon } from '../Icon'
import { TourSection } from './Tour'

type Value = string | number | boolean | null

const show = (v: Value) => (v == null ? '—' : String(v))

/** Before vs after: the same workload with and without the change, and with it undone. */
export function ExperimentStory({ show: sc, placeholder }: { show: Showcase | null; placeholder: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const sum = sc ? experimentSummary(sc.inv) : null
  const numbers = sum ? [sum.baseline, sum.candidate, sum.control, sum.limit?.value ?? null].filter((v): v is number => typeof v === 'number') : []
  const max = numbers.length ? Math.max(...numbers) * 1.15 : 0
  const pct = (v: Value) => (typeof v === 'number' && max > 0 ? `${(v / max) * 100}%` : null)
  const limitPct = sum?.limit?.value != null ? pct(sum.limit.value) : null

  const runs: { role: string; desc: string; value: Value; tone: 'ok' | 'fail' | 'neutral' }[] = sum
    ? [
        { role: 'Baseline', desc: 'without the change', value: sum.baseline, tone: 'ok' },
        { role: 'Candidate', desc: 'with the change', value: sum.candidate, tone: sum.candidateFailed ? 'fail' : 'ok' },
        { role: 'Control', desc: 'change undone again', value: sum.control, tone: 'ok' },
      ]
    : []

  return (
    <TourSection
      id="experiment"
      kicker="The proof"
      title="It doesn't guess. It runs the experiment."
      lede="Same workload, three runs; only the change differs. Pass or fail comes from the system's own checks, and a rule-based judge, not the AI, decides the verdict."
      placeholder={placeholder}
      link={sc ? { href: href.case(sc.caseEntry.id, { section: 'experiments' }), label: 'See the full experiment' } : undefined}
    >
      {!sum ? (
        <p className="tour-empty">The experiment appears here once a run has compared baseline and candidate.</p>
      ) : (
        <div ref={ref} className={`exp-story${inView ? ' in-view' : ''}`}>
          <p className="exp-key">
            Measuring <code>{sum.key}</code>
          </p>
          <ul className="exp-runs">
            {runs.map((r, i) => (
              <li key={r.role} className={`exp-run tone-${r.tone}`} style={{ '--i': i } as CSSProperties}>
                <span className="exp-role">
                  {r.role} <span className="exp-desc">{r.desc}</span>
                </span>
                <span className="exp-value">{show(r.value)}</span>
                <span className="exp-bar" aria-hidden="true">
                  {pct(r.value) && <span className="exp-bar-fill" style={{ width: pct(r.value)! }} />}
                  {limitPct && <span className="exp-limit" style={{ left: limitPct }} />}
                </span>
                <span className="exp-outcome">
                  <Icon name={r.tone === 'fail' ? 'x-circle' : 'check-circle'} size={14} />
                  {r.tone === 'fail' ? 'Failed' : 'Passed'}
                </span>
              </li>
            ))}
          </ul>
          <p className="exp-notes small">
            {sum.limit &&
              (sum.limit.value != null ? (
                <>
                  Limit: <code>{sum.limit.name}</code> = {sum.limit.value} (from the data, row{' '}
                  <code>{sum.limit.evidenceId}</code>).{' '}
                </>
              ) : (
                <>
                  Bounded by <code>{sum.limit.name}</code>.{' '}
                </>
              ))}
            {sum.failure && (
              <>
                The candidate failed <code>{sum.failure}</code>.
              </>
            )}
          </p>
        </div>
      )}
    </TourSection>
  )
}

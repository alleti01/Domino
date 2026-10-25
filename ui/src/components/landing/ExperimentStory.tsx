import type { Showcase } from '../../lib/showcase'
import { experimentSummary } from '../../lib/showcase'
import { href } from '../../lib/router'
import { CountUp } from './Motion'
import { TourSection } from './Tour'

type Value = string | number | boolean | null
const text = (v: Value) => (v == null ? '—' : String(v))

/** The sandbox, set on a dark band: the same workload with and without the change, then undone. */
export function ExperimentStory({ show: sc, placeholder }: { show: Showcase | null; placeholder: boolean }) {
  const sum = sc ? experimentSummary(sc.inv) : null
  const numbers = sum
    ? [sum.baseline, sum.candidate, sum.control, sum.limit?.value ?? null].filter((v): v is number => typeof v === 'number')
    : []
  const max = numbers.length ? Math.max(...numbers) * 1.12 : 0
  const at = (v: Value) => (typeof v === 'number' && max > 0 ? `${(v / max) * 100}%` : null)

  const runs = sum
    ? [
        { role: 'Baseline', desc: 'without the change', value: sum.baseline, failed: false },
        { role: 'Candidate', desc: 'with the change', value: sum.candidate, failed: sum.candidateFailed },
        { role: 'Control', desc: 'change undone again', value: sum.control, failed: false },
      ]
    : []
  const limitAt = sum?.limit?.value != null ? at(sum.limit.value) : null
  const marks = new Map<string, typeof runs>()
  for (const r of runs) {
    const left = at(r.value)
    if (left) marks.set(left, [...(marks.get(left) ?? []), r])
  }

  return (
    <TourSection
      id="experiment"
      number="02"
      kicker="The proof"
      title="It doesn't guess."
      titleTail="It runs the experiment."
      lede="Same workload, three runs; only the change differs. Pass or fail comes from the system's own checks, and a rule-based judge, not the AI, decides the verdict."
      placeholder={placeholder}
      className="band-dark"
      navTheme="dark"
      link={sc ? { href: href.case(sc.caseEntry.id, { section: 'experiments' }), label: 'See the full experiment' } : undefined}
    >
      {!sum ? (
        <p className="tour-empty">The experiment appears here once a run has compared baseline and candidate.</p>
      ) : (
        <div className="exp">
          <p className="exp-measure">
            Measuring <code>{sum.key}</code>
          </p>
          <ul className="exp-cols">
            {runs.map((r) => (
              <li key={r.role} className={`exp-col${r.failed ? ' failed' : ''}`}>
                <span className="exp-role">{r.role}</span>
                <span className="exp-desc">{r.desc}</span>
                <span className="exp-num">
                  <CountUp value={text(r.value)} />
                </span>
                <span className="exp-result">{r.failed ? '✕ Failed' : '✓ Passed'}</span>
              </li>
            ))}
          </ul>

          {numbers.length > 1 && (
            <div className="exp-scale" aria-hidden="true">
              <span className="exp-scale-track" />
              {/* Runs with the same value share one mark, e.g. "Baseline · Control". */}
              {[...marks].map(([left, group]) => (
                <span key={left} className={`exp-mark${group.some((r) => r.failed) ? ' failed' : ''}`} style={{ left }}>
                  <span>{group.map((r) => r.role).join(' · ')}</span>
                </span>
              ))}
              {limitAt && (
                <span className="exp-limit" style={{ left: limitAt }}>
                  <span>limit {sum.limit!.value}</span>
                </span>
              )}
            </div>
          )}

          <p className="exp-note">
            {sum.limit &&
              (sum.limit.value != null ? (
                <>
                  Limit <code>{sum.limit.name}</code> = {sum.limit.value}, stated in row <code>{sum.limit.evidenceId}</code>.{' '}
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

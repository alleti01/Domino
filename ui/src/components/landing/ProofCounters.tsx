import type { SiteData } from '../../types'
import { isNemotron } from '../../lib/labels'
import { href } from '../../lib/router'
import { Arrow, CountUp } from './Motion'
import { TourSection } from './Tour'

/** Figures counted from the saved runs, each linking to the exact evidence behind it. */
export function ProofCounters({ site }: { site: SiteData }) {
  const invs = site.cases.flatMap((c) => c.runs.flatMap((r) => (r.load.ok ? [r.load.investigation] : [])))
  const calls = invs.flatMap((i) => i.receipts)
  const nemotron = calls.filter((r) => r.routedModel && isNemotron(r.routedModel)).length
  const sources = new Set(invs.flatMap((i) => [...i.evidence.values()].filter((e) => e.kind === 'row').map((e) => e.source)))
  const judged = invs.filter((i) => i.verdict?.decidedBy === 'deterministic_judge').length
  const verdicts = invs.filter((i) => i.verdict).length
  const memory = invs.reduce((n, i) => n + i.memory.length, 0)

  const items = [
    { value: `${nemotron}/${calls.length}`, label: 'model calls answered by NVIDIA Nemotron', tech: 'Meterless Nightshift', to: href.underTheHoodAt('nemotron'), cta: 'Receipt log' },
    { value: String(sources.size), label: 'independent data sources joined', tech: 'Zetaris semantic layer', to: href.underTheHoodAt('zetaris'), cta: 'Sources' },
    { value: `${judged}/${verdicts}`, label: 'verdicts decided by a rule-based judge, not the AI', tech: 'Deterministic judge', to: href.results, cta: 'Results' },
    { value: String(memory), label: 'memory reads and writes across runs', tech: 'Meterless World Model', to: href.underTheHoodAt('meterless'), cta: 'Activity' },
  ]

  return (
    <TourSection
      id="proof"
      number="05"
      kicker="Proof"
      title="Proof,"
      titleTail="not promises."
      lede="Every figure here is counted from the saved runs. Each one opens the evidence behind it."
      placeholder={site.isPlaceholder}
    >
      <ul className="proof-row">
        {items.map((i) => (
          <li key={i.label}>
            <a className="proof-item" href={i.to}>
              <span className="proof-value">
                <CountUp value={i.value} />
              </span>
              <span className="proof-label">{i.label}</span>
              <span className="proof-tech">{i.tech}</span>
              <span className="proof-cta">
                {i.cta}
                <Arrow />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </TourSection>
  )
}

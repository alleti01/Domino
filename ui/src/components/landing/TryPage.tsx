import type { SiteState } from '../../data/useSite'
import { href } from '../../lib/router'
import { caseCards } from './giga/data'

// Pick a recorded change and open its investigation.
export function TryPage({ state }: { state: SiteState }) {
  const cards = state.status === 'ready' ? caseCards(state.site.cases) : []
  return (
    <section className="g-try" aria-labelledby="try-title">
      <div className="g-wrap">
        <p className="g-label" style={{ marginBottom: 18 }}>
          Try it yourself
        </p>
        <h1 id="try-title" className="g-h2">
          Pick a change. See what Domino found.
        </h1>
        <p className="g-lead">Each change opens its recorded investigation: the evidence, the runs and the verdict.</p>
        {state.status === 'loading' && <p className="g-body">Loading changes…</p>}
        <div className="g-cases" style={{ gridTemplateColumns: '1fr' }}>
          <ul className="g-cases-list" aria-label="Recorded changes">
            {cards.map((k) => (
              <li key={k.id}>
                <a href={href.case(k.id)} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px', padding: '18px 28px' }}>
                  <span className="g-case-name" style={{ color: 'var(--g-ink)' }}>
                    {k.title}
                  </span>
                  <span className={`g-case-num${k.failed ? ' g-fail' : ''}`}>
                    {k.baseline}→{k.candidate}
                  </span>
                  <span className="g-case-sub">
                    {k.verdictLabel} · {k.id}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

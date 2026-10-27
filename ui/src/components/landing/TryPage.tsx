import type { SiteState } from '../../data/useSite'
import { href } from '../../lib/router'

// S1/S2 stub so the route and both "Try it yourself" buttons work. S4 builds
// the change picker and the step-by-step replay here.
export function TryPage({ state }: { state: SiteState }) {
  const cases = state.status === 'ready' ? state.site.cases.filter((c) => c.runs[0]?.load.ok) : []
  return (
    <div className="landing">
      <section className="landing-section" aria-labelledby="try-title">
        <p className="page-kicker">Try it yourself</p>
        <h1 id="try-title">Pick a change and watch Domino investigate it.</h1>
        <p className="landing-lede">
          The step-by-step replay is the next build step. For now, each change opens its saved investigation.
        </p>
        {state.status === 'loading' && <p className="muted">Loading changes…</p>}
        <ul className="case-cards">
          {cases.map((c) => {
            const inv = c.runs[0].load.ok ? c.runs[0].load.investigation : null
            return (
              <li key={c.id} className="case-card">
                <p className="small muted">{c.label}</p>
                <h2>{inv?.change?.title ?? c.label}</h2>
                <a className="button button-primary" href={href.case(c.id)}>
                  Open the investigation
                </a>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

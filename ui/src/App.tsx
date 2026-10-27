import { useEffect, useRef } from 'react'
import type { CaseEntry, RunEntry, SiteData } from './types'
import { useSite } from './data/useSite'
import { useLocation, type Route } from './lib/router'
import { stopSmoothScroll } from './lib/smoothScroll'
import { LandingPage } from './components/landing/LandingPage'
import { Announcement, SiteFooter, SiteNav } from './components/landing/SiteChrome'
import { TryPage } from './components/landing/TryPage'
import { Dashboard } from './dash/Dashboard'

/** The case and run a case route points at; latest run when ?run is absent. */
function resolveRun(site: SiteData, route: Route): { caseEntry?: CaseEntry; run?: RunEntry } {
  if (route.name !== 'case') return {}
  const caseEntry = site.cases.find((c) => c.id === route.caseId)
  const run = route.runId ? caseEntry?.runs.find((r) => r.runId === route.runId) : caseEntry?.runs[0]
  return { caseEntry, run }
}

function pageTitle(route: Route, caseEntry?: CaseEntry) {
  switch (route.name) {
    case 'home':
      return 'Domino: find what breaks before you ship'
    case 'try':
      return 'Try it yourself · Domino'
    case 'cases-index':
      return 'Investigations · Domino'
    case 'overview':
      return 'Overview · Domino'
    case 'runs':
      return 'Runs · Domino'
    case 'live':
      return 'Live check · Domino'
    case 'docs':
      return 'Docs · Domino'
    case 'changelog':
      return 'Changelog · Domino'
    case 'results':
      return 'Results · Domino'
    case 'under-the-hood':
      return 'Platform · Domino'
    case 'case':
      return caseEntry ? `${caseEntry.label} · Domino` : 'Domino'
    default:
      return 'Domino'
  }
}

/** Landing-style pages: top nav and footer, no sidebar. */
const isLanding = (route: Route) => route.name === 'home' || route.name === 'try'

export default function App() {
  const loc = useLocation()
  const { route } = loc
  const state = useSite(isLanding(loc.route) ? 'site' : 'console')
  const mainRef = useRef<HTMLElement>(null)

  const site = state.status === 'ready' ? state.site : null
  const { caseEntry, run } = site ? resolveRun(site, route) : {}

  // New page (not just a new query param): scroll to top and move focus there
  // so keyboard and screen-reader users land on it.
  const pageKey = `${loc.path}?run=${route.name === 'case' ? route.runId : ''}`
  const jumpingToSection = loc.params.has('section')
  useEffect(() => {
    // A ?section= link scrolls itself; don't undo it.
    if (jumpingToSection) return
    window.scrollTo(0, 0)
    mainRef.current?.focus({ preventScroll: true })
  }, [pageKey, jumpingToSection])

  useEffect(() => {
    document.title = pageTitle(route, caseEntry)
  }, [route, caseEntry])

  // Smooth scrolling on the landing pages only; the dashboard scrolls natively.
  const landing = isLanding(route)
  // Native scrolling everywhere: the landing page's pinned sections drive their own playback.
  useEffect(() => stopSmoothScroll, [landing])

  const skipLink = (
    <button type="button" className="skip-link" onClick={() => mainRef.current?.focus()}>
      Skip to content
    </button>
  )

  if (landing) {
    return (
      <div className="g">
        {skipLink}
        <Announcement />
        <SiteNav />
        <main id="main" ref={mainRef} tabIndex={-1} className="site-main">
          {route.name === 'try' ? <TryPage state={state} /> : <LandingPage state={state} section={route.section} />}
        </main>
        <SiteFooter />
      </div>
    )
  }

  return <Dashboard loc={loc} state={state} caseEntry={caseEntry} run={run} />
}

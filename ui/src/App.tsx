import { useEffect, useRef, useState } from 'react'
import type { CaseEntry, RunEntry, SiteData } from './types'
import { useSite, type PreviewState } from './data/useSite'
import { useLocation, type Route } from './lib/router'
import { startSmoothScroll, stopSmoothScroll } from './lib/smoothScroll'
import { CasesView } from './components/CasesView'
import { EvidencePanel } from './components/EvidencePanel'
import { InvestigationView } from './components/InvestigationView'
import { ScorecardView } from './components/ScorecardView'
import { Shell } from './components/Shell'
import { EmptyView, ErrorView, LoadingView, NotFoundView } from './components/StateViews'
import { UnderTheHoodView } from './components/UnderTheHoodView'
import { LandingPage } from './components/landing/LandingPage'
import { AnnouncementBar, SiteFooter, SiteNav } from './components/landing/SiteChrome'
import { TryPage } from './components/landing/TryPage'

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
    case 'results':
      return 'Results · Domino'
    case 'under-the-hood':
      return 'System proof · Domino'
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
  const [preview, setPreview] = useState<PreviewState>('normal')
  const state = useSite(preview)
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
  useEffect(() => {
    if (!landing) return
    startSmoothScroll()
    return stopSmoothScroll
  }, [landing])

  const skipLink = (
    <button type="button" className="skip-link" onClick={() => mainRef.current?.focus()}>
      Skip to content
    </button>
  )

  if (landing) {
    return (
      <div className="site">
        {skipLink}
        <AnnouncementBar />
        <SiteNav />
        <main id="main" ref={mainRef} tabIndex={-1} className="site-main">
          {route.name === 'try' ? <TryPage state={state} /> : <LandingPage state={state} section={route.section} />}
        </main>
        <SiteFooter />
      </div>
    )
  }

  let content
  if (state.status === 'loading') content = <LoadingView />
  else if (state.status === 'error') content = <ErrorView message={state.message} />
  else {
    const s = state.site
    switch (route.name) {
      case 'cases-index':
        content = s.cases.length === 0 ? <EmptyView /> : <CasesView site={s} />
        break
      case 'results':
        content = <ScorecardView scorecard={s.scorecard!} cases={s.cases} section={route.section} />
        break
      case 'under-the-hood':
        content = <UnderTheHoodView site={s} section={route.section} />
        break
      case 'case':
        if (!caseEntry) content = s.cases.length === 0 ? <EmptyView /> : <NotFoundView what="Case" />
        else if (!run) content = caseEntry.runs.length === 0 ? <EmptyView /> : <NotFoundView what="Run" />
        else content = <InvestigationView cases={s.cases} caseEntry={caseEntry} run={run} view={route.view} section={route.section} />
        break
      default:
        content = <NotFoundView what="Page" />
    }
  }

  const inv = run?.load.ok ? run.load.investigation : null

  return (
    <div className={`app${site && loc.evidenceId ? ' has-inspector' : ''}`}>
      {skipLink}
      <Shell route={route} preview={preview} onPreview={setPreview} />
      <main id="main" ref={mainRef} tabIndex={-1} className="app-main">
        {content}
      </main>
      {site && loc.evidenceId && <EvidencePanel key={`${route.name === 'case' ? route.caseId : ''}:${run?.runId ?? ''}`} id={loc.evidenceId} inv={inv} />}
    </div>
  )
}

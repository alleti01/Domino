import { useEffect, useRef } from 'react'
import type { SiteState } from '../data/useSite'
import { href, type AppLocation } from '../lib/router'
import type { CaseEntry, RunEntry, SiteData } from '../types'
import { Console, type Crumb } from './Console'
import './dash.css'
import { EvidenceDrawer } from './EvidenceDrawer'
import { Investigations } from './pages/Investigations'
import { Changelog } from './pages/Changelog'
import { Docs } from './pages/Docs'
import { LiveCheck } from './pages/LiveCheck'
import { Overview } from './pages/Overview'
import { Platform, PLATFORM_TITLE, platformSection } from './pages/Platform'
import { Report } from './pages/report/Report'
import { Results } from './pages/Results'
import { Runs } from './pages/Runs'
import { Alert, Empty, Panel } from './ui'

function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <span className="dx-skel" style={{ width: 220, height: 22, marginBottom: 24 }} />
      <div className="dx-stats">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="dx-stat">
            <span className="dx-skel" style={{ width: '60%' }} />
            <span className="dx-skel" style={{ width: '40%', height: 20, marginTop: 6 }} />
          </div>
        ))}
      </div>
      <Panel>
        <div style={{ display: 'grid', gap: 14 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="dx-skel" style={{ width: `${90 - i * 7}%` }} />
          ))}
        </div>
      </Panel>
    </div>
  )
}

/** Before the first run: not connected, connected and waiting, or watching a repository. */
function NoRuns({ site }: { site: SiteData }) {
  const watch = site.project.watches[0]
  const docs = (
    <a className="dx-link" href={href.docs('cli')}>
      Command line reference
    </a>
  )
  if (!site.project.connected) {
    return (
      <Panel>
        <Empty icon="investigations" title="No project connected">
          Run <code>domino dashboard</code> in your project and its checks appear here as they run. {docs}
        </Empty>
      </Panel>
    )
  }
  if (watch) {
    const n = watch.queued.length + (watch.current != null ? 1 : 0)
    return (
      <Panel>
        <Empty icon="pr" title={`Watching ${watch.repo}`}>
          {n ? `${n} pull request${n === 1 ? '' : 's'} queued.` : 'No pull requests waiting.'} Each one appears here as Domino checks it. {docs}
        </Empty>
      </Panel>
    )
  }
  return (
    <Panel>
      <Empty icon="investigations" title="Connected, no runs yet">
        Check a pull request with <code>domino pr &lt;number&gt; --repo owner/name</code>, or watch a repository with{' '}
        <code>domino watch --repo owner/name</code>. {docs}
      </Empty>
    </Panel>
  )
}

function NotFound({ what }: { what: string }) {
  return (
    <Panel>
      <Empty icon="alert" title={`${what} not found`}>
        <a className="dx-link" href={href.cases}>
          Back to investigations
        </a>
      </Empty>
    </Panel>
  )
}

const ROOT: Crumb = { label: 'Console', href: href.overview }

export function Dashboard({
  loc,
  state,
  caseEntry,
  run,
}: {
  loc: AppLocation
  state: SiteState
  caseEntry?: CaseEntry
  run?: RunEntry
}) {
  const { route } = loc
  const mainRef = useRef<HTMLElement>(null)
  const site = state.status === 'ready' ? state.site : null

  // A new page (not a tab or the evidence drawer) starts at the top with focus on it.
  const pageKey = route.name === 'case' ? `case:${route.caseId}:${route.runId ?? ''}` : loc.path
  useEffect(() => {
    window.scrollTo(0, 0)
    mainRef.current?.focus({ preventScroll: true })
  }, [pageKey])

  let crumbs: Crumb[] = [ROOT]
  let content
  if (state.status === 'loading') content = <Loading />
  else if (state.status === 'error')
    content = (
      <Alert tone="fail" icon="alert">
        <strong>The run data couldn’t be loaded.</strong> {state.message}
      </Alert>
    )
  else {
    const s = state.site
    switch (route.name) {
      case 'overview':
        crumbs = [ROOT, { label: 'Overview' }]
        content = s.cases.length === 0 ? <NoRuns site={s} /> : <Overview site={s} />
        break
      case 'cases-index':
        crumbs = [ROOT, { label: 'Investigations' }]
        content = s.cases.length === 0 ? <NoRuns site={s} /> : <Investigations site={s} />
        break
      case 'runs':
        crumbs = [ROOT, { label: 'Runs' }]
        content = s.cases.length === 0 ? <NoRuns site={s} /> : <Runs site={s} />
        break
      case 'docs':
        crumbs = [ROOT, { label: 'Docs', href: href.docs() }]
        content = <Docs page={route.page} />
        break
      case 'changelog':
        crumbs = [ROOT, { label: 'Changelog' }]
        content = <Changelog />
        break
      case 'live':
        crumbs = [ROOT, { label: 'Live check' }]
        content = <LiveCheck site={s} caseId={route.caseId} />
        break
      case 'results':
        crumbs = [ROOT, { label: 'Results' }]
        content = s.cases.length === 0 ? <NoRuns site={s} /> : <Results site={s} />
        break
      case 'under-the-hood': {
        const sec = platformSection(route.section)
        crumbs = [ROOT, { label: 'Platform' }, { label: PLATFORM_TITLE[sec] }]
        content = s.cases.length === 0 ? <NoRuns site={s} /> : <Platform site={s} section={sec} />
        break
      }
      case 'case':
        crumbs = [ROOT, { label: 'Investigations', href: href.cases }, { label: caseEntry?.label ?? route.caseId }]
        if (!caseEntry) content = s.cases.length === 0 ? <NoRuns site={s} /> : <NotFound what="Investigation" />
        else if (!run) content = caseEntry.runs.length === 0 ? <NoRuns site={s} /> : <NotFound what="Run" />
        else content = <Report caseEntry={caseEntry} run={run} view={route.view} section={route.section} runParam={route.runId} />
        break
      default:
        crumbs = [ROOT, { label: 'Not found' }]
        content = <NotFound what="Page" />
    }
  }

  const inv = run?.load.ok ? run.load.investigation : null
  return (
    <Console
      route={route}
      site={site}
      crumbs={crumbs}
      mainRef={mainRef}
      full={route.name === 'live' && state.status === 'ready'}
      drawer={site && loc.evidenceId ? <EvidenceDrawer key={`${run?.runId}:${loc.evidenceId}`} id={loc.evidenceId} inv={inv} /> : null}
    >
      {site?.warnings.length ? (
        <details className="dx-alert tone-warn" style={{ display: 'block' }}>
          <summary style={{ cursor: 'pointer' }}>
            {site.warnings.length} file{site.warnings.length === 1 ? '' : 's'} had problems and were skipped
          </summary>
          <ul className="dx-list dx-mt-s mono">
            {site.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {content}
    </Console>
  )
}

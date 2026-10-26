import { useEffect, useRef } from 'react'
import type { CaseEntry, RunEntry } from '../types'
import { CASE_KIND, RUN_MODE, RUN_STATUS, VERDICT, formatMs } from '../lib/labels'
import { REPORT_TABS, resolveSection, traceOrigin, type ReportTab } from '../lib/report'
import { href, navigate, type ReportView } from '../lib/router'
import { scrollToSection } from '../lib/scroll'
import { Breadcrumbs, PlaceholderNotice, VerdictMark } from './common'
import { Icon } from './Icon'
import { PrCheckView } from './PrCheckView'
import { AuditView } from './report/Audit'
import { ContextView } from './report/Context'
import { ExperimentsView } from './report/Experiments'
import { HypothesesView } from './report/Hypotheses'
import { SummaryView } from './report/Summary'
import { RunErrorView } from './StateViews'

const when = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function InvestigationView({
  cases,
  caseEntry,
  run,
  view,
  section,
}: {
  cases: CaseEntry[]
  caseEntry: CaseEntry
  run: RunEntry
  view: ReportView
  section: string | null
}) {
  // Keep the run in links only when it isn't the latest, so default URLs stay short.
  const runParam = run.runId === caseEntry.runs[0]?.runId ? null : run.runId
  const { tab, anchor } = resolveSection(section)
  const tabsRef = useRef<HTMLElement>(null)
  const inv = run.load.ok ? run.load.investigation : null

  // A deep link to an old section reveals it inside its tab; a tab change keeps the tabs in view.
  useEffect(() => {
    if (view !== 'investigation') return
    if (anchor) {
      scrollToSection(anchor)
      return
    }
    const bar = tabsRef.current
    if (section && bar && bar.getBoundingClientRect().top < 0) bar.scrollIntoView({ block: 'start' })
  }, [anchor, section, view, run.runId])

  const tabHref = (t: ReportTab) => href.case(caseEntry.id, { runId: runParam, section: t === 'summary' ? null : t })

  return (
    <article className="page report" aria-labelledby="page-title">
      {inv?.isPlaceholder && <PlaceholderNotice />}

      <header className="report-head">
        <div className="report-topline">
          <Breadcrumbs
            items={[
              { label: 'Investigations', href: href.cases },
              { label: caseEntry.label, href: href.case(caseEntry.id) },
              ...(view === 'pr' ? [{ label: 'PR preview' }] : []),
            ]}
          />
          <Switchers cases={cases} caseEntry={caseEntry} run={run} view={view} section={section} />
        </div>

        <p className="report-kicker">{CASE_KIND[caseEntry.kind]}</p>
        <h1 id="page-title">{inv?.change?.title ?? caseEntry.label}</h1>

        <ul className="report-meta" aria-label="About this run">
          <li>
            {run.verdict ? (
              <VerdictMark verdict={run.verdict} />
            ) : (
              <span className={`verdict-mark tone-${RUN_STATUS[run.status].tone}`}>
                <Icon name={RUN_STATUS[run.status].icon} size={15} />
                <span>{run.status === 'running' ? 'No verdict in the saved trace' : RUN_STATUS[run.status].label}</span>
              </span>
            )}
          </li>
          <li className="meta-quiet">{traceOrigin(run)}</li>
          {run.runMode !== 'full' && <li className="meta-flag">Comparison mode: {RUN_MODE[run.runMode].label}</li>}
          {inv?.startedAt && <li className="meta-quiet">{when(inv.startedAt)}</li>}
          {inv?.durationMs != null && <li className="meta-quiet">{formatMs(inv.durationMs)}</li>}
          <li className="meta-quiet">
            Run <code title={run.runId}>{run.runId}</code>
          </li>
        </ul>
      </header>

      <nav className="report-tabs" aria-label="Report views" ref={tabsRef}>
        <ul>
          {REPORT_TABS.map((t) => (
            <li key={t.id}>
              <a href={tabHref(t.id)} aria-current={view === 'investigation' && tab === t.id ? 'page' : undefined}>
                {t.label}
                {inv && t.id === 'hypotheses' && <span className="tab-count">{inv.hypotheses.length}</span>}
                {inv && t.id === 'experiments' && <span className="tab-count">{inv.experiments.length}</span>}
              </a>
            </li>
          ))}
        </ul>
        <a
          className="tab-pr"
          href={href.case(caseEntry.id, { view: 'pr', runId: runParam })}
          aria-current={view === 'pr' ? 'page' : undefined}
        >
          <Icon name="git-pr" size={15} /> PR preview
        </a>
      </nav>

      {!run.load.ok ? (
        <RunErrorView runId={run.runId} message={run.load.error} />
      ) : view === 'pr' ? (
        <PrCheckView key={`${caseEntry.id}:${run.runId}`} inv={run.load.investigation} runParam={runParam} />
      ) : (
        <div className="report-body" id={`panel-${tab}`} key={`${caseEntry.id}:${run.runId}`}>
          {tab === 'summary' && <SummaryView inv={run.load.investigation} runParam={runParam} />}
          {tab === 'context' && <ContextView inv={run.load.investigation} />}
          {tab === 'hypotheses' && <HypothesesView inv={run.load.investigation} />}
          {tab === 'experiments' && <ExperimentsView inv={run.load.investigation} />}
          {tab === 'audit' && <AuditView inv={run.load.investigation} section={section} runParam={runParam} />}
        </div>
      )}
    </article>
  )
}

/** Case and run selection, kept apart from the global navigation. */
function Switchers({
  cases,
  caseEntry,
  run,
  view,
  section,
}: {
  cases: CaseEntry[]
  caseEntry: CaseEntry
  run: RunEntry
  view: ReportView
  section: string | null
}) {
  const { tab } = resolveSection(section)
  return (
    <div className="switchers">
      {cases.length > 1 && (
        <div className="switch">
          <label htmlFor="case-switch">Case</label>
          <select
            id="case-switch"
            value={caseEntry.id}
            onChange={(e) => navigate(href.case(e.target.value, { view, section: view === 'pr' || tab === 'summary' ? null : tab }))}
          >
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="switch">
        <label htmlFor="run-switch">Run</label>
        {caseEntry.runs.length > 1 ? (
          <select
            id="run-switch"
            value={run.runId}
            onChange={(e) => {
              const i = caseEntry.runs.findIndex((r) => r.runId === e.target.value)
              navigate(href.case(caseEntry.id, { view, runId: i === 0 ? null : e.target.value, section: view === 'pr' ? null : section }))
            }}
          >
            {caseEntry.runs.map((r, i) => (
              <option key={r.runId} value={r.runId}>
                {i === 0 ? 'Latest · ' : ''}
                {when(r.startedAt)}
                {r.runMode !== 'full' ? ` · ${RUN_MODE[r.runMode].label}` : ''} · {r.verdict ? VERDICT[r.verdict].label : RUN_STATUS[r.status].label}
              </option>
            ))}
          </select>
        ) : (
          <span id="run-switch" className="switch-static">
            Only run
          </span>
        )}
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import type { CaseEntry, Investigation, RunEntry, Verdict } from '../types'
import { CASE_KIND, RUN_MODE, RUN_STATUS, VERDICT, formatMs } from '../lib/labels'
import { href, navigate, type ReportView } from '../lib/router'
import { plural, summarizeRuns } from '../lib/runs'
import { jumpTo, scrollToSection } from '../lib/scroll'
import { Badge, Breadcrumbs, PlaceholderNotice } from './common'
import { Icon } from './Icon'
import { ChangeSection } from './investigation/ChangeSection'
import { DependencyChainSection } from './investigation/DependencyChainSection'
import { ExperimentsSection } from './investigation/ExperimentsSection'
import { HypothesesSection } from './investigation/HypothesesSection'
import { ReceiptsSection } from './investigation/ReceiptsSection'
import { TraceSection } from './investigation/TraceSection'
import { VerdictBanner, VerdictSection } from './investigation/VerdictSection'
import { PrCheckView } from './PrCheckView'
import { RunErrorView } from './StateViews'

const SECTIONS = [
  ['change', 'Change'],
  ['chain', 'Dependency chain'],
  ['hypotheses', 'Hypotheses'],
  ['experiments', 'Experiments'],
  ['verdict', 'Verdict'],
  ['receipts', 'Receipts'],
  ['trace', 'Trace'],
] as const

export function InvestigationView({
  caseEntry,
  run,
  view,
  section,
}: {
  caseEntry: CaseEntry
  run: RunEntry
  view: ReportView
  section: string | null
}) {
  // Keep the run in links only when it isn't the latest, so default URLs stay short.
  const runParam = run.runId === caseEntry.runs[0]?.runId ? null : run.runId

  // ?section=chain (from the overview or PR view) scrolls to that section.
  useEffect(() => {
    if (section && view === 'investigation') scrollToSection(section)
  }, [section, view, run.runId])

  return (
    <article className="page" aria-labelledby="page-title">
      {run.load.ok && run.load.investigation.isPlaceholder && <PlaceholderNotice />}

      <header className="page-head">
        <Breadcrumbs
          items={[
            { label: 'Overview', href: href.cases },
            { label: caseEntry.label, href: href.case(caseEntry.id) },
            { label: run.runId },
          ]}
        />
        <p className="page-kicker">{CASE_KIND[caseEntry.kind]}</p>
        <h1 id="page-title">{run.load.ok ? (run.load.investigation.change?.title ?? 'Untitled change') : caseEntry.label}</h1>
        <RunMeta caseEntry={caseEntry} run={run} />
        <RunBar caseEntry={caseEntry} run={run} view={view} />
        <nav className="view-tabs" aria-label="View">
          <a href={href.case(caseEntry.id, { runId: runParam })} aria-current={view === 'investigation' ? 'page' : undefined}>
            <Icon name="list" /> Investigation
          </a>
          <a href={href.case(caseEntry.id, { view: 'pr', runId: runParam })} aria-current={view === 'pr' ? 'page' : undefined}>
            <Icon name="git-pr" /> PR check
          </a>
        </nav>
      </header>

      {!run.load.ok ? (
        <RunErrorView runId={run.runId} message={run.load.error} />
      ) : view === 'pr' ? (
        <PrCheckView inv={run.load.investigation} runParam={runParam} />
      ) : (
        <Report inv={run.load.investigation} />
      )}
    </article>
  )
}

/** Run picker plus how all of this case's runs came out. */
function RunBar({ caseEntry, run, view }: { caseEntry: CaseEntry; run: RunEntry; view: ReportView }) {
  const sum = summarizeRuns(caseEntry)
  const pickerId = `run-picker-${caseEntry.id}`
  return (
    <div className="run-bar">
      {caseEntry.runs.length > 1 && (
        <div className="run-picker">
          <label htmlFor={pickerId}>Run</label>
          <select
            id={pickerId}
            value={run.runId}
            onChange={(e) => {
              const i = caseEntry.runs.findIndex((r) => r.runId === e.target.value)
              navigate(href.case(caseEntry.id, { view, runId: i === 0 ? null : e.target.value }))
            }}
          >
            {caseEntry.runs.map((r, i) => (
              <option key={r.runId} value={r.runId}>
                {i === 0 ? 'Latest: ' : ''}
                {r.runId}
                {r.runMode !== 'full' ? ` (${RUN_MODE[r.runMode].label})` : ''} ·{' '}
                {r.verdict ? VERDICT[r.verdict].label : RUN_STATUS[r.status].label}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="run-summary small">
        <span className="muted">Across {plural(sum.total, 'Domino run')}:</span>
        {(Object.entries(sum.counts) as [Verdict, number][]).map(([verdict, n]) => {
          const v = VERDICT[verdict]
          return (
            <Badge key={verdict} tone={v.tone} icon={v.icon}>
              {n} × {v.label}
            </Badge>
          )
        })}
        {sum.decided > 0 && sum.matching != null && caseEntry.expectedVerdict && (
          <span className="muted">
            {sum.matching} of {sum.decided} match the expected verdict ({VERDICT[caseEntry.expectedVerdict].label.toLowerCase()})
          </span>
        )}
        {sum.decided === 0 && <span className="muted">no verdicts yet</span>}
        {sum.ablations > 0 && <span className="muted">· plus {plural(sum.ablations, 'comparison run')} in reduced modes</span>}
      </p>
    </div>
  )
}

function RunMeta({ caseEntry, run }: { caseEntry: CaseEntry; run: RunEntry }) {
  const inv = run.load.ok ? run.load.investigation : null
  const index = caseEntry.runs.indexOf(run)
  return (
    <div className="page-meta">
      {run.replay ? (
        <Badge tone="warn" icon="info">
          Replayed from a recording
        </Badge>
      ) : (
        <Badge tone="accent">Live run</Badge>
      )}
      {run.runMode !== 'full' && (
        <Badge tone="muted">
          Comparison mode: {RUN_MODE[run.runMode].label} ({RUN_MODE[run.runMode].description.toLowerCase()})
        </Badge>
      )}
      {run.status !== 'complete' && (
        <Badge tone={RUN_STATUS[run.status].tone} icon={RUN_STATUS[run.status].icon}>
          {RUN_STATUS[run.status].label}
        </Badge>
      )}
      {run.status === 'complete' && <span className="small muted">Duration {formatMs(inv?.durationMs ?? null)}</span>}
      <span className="small muted">
        Run <code>{run.runId}</code>
        {caseEntry.runs.length > 1 && (index === 0 ? ` · latest of ${caseEntry.runs.length}` : ` · ${index + 1} of ${caseEntry.runs.length}`)}
      </span>
    </div>
  )
}

function Report({ inv }: { inv: Investigation }) {
  const running = inv.status === 'running'
  return (
    <>
      <VerdictBanner report={inv.verdict} status={inv.status} errors={inv.errors} review={inv.review} />
      {inv.warnings.length > 0 && (
        <details className="warnings">
          <summary>
            {inv.warnings.length} data warning{inv.warnings.length > 1 ? 's' : ''} in this run
          </summary>
          <ul className="bullets small">
            {inv.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      <nav className="section-nav" aria-label="Sections">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} onClick={(ev) => jumpTo(ev, id)}>
            {label}
          </a>
        ))}
      </nav>
      <ChangeSection change={inv.change} />
      <DependencyChainSection chain={inv.chain} hasVerdict={inv.verdict != null} />
      <HypothesesSection hypotheses={inv.hypotheses} />
      <ExperimentsSection experiments={inv.experiments} running={running} />
      <VerdictSection report={inv.verdict} review={inv.review} />
      <ReceiptsSection receipts={inv.receipts} />
      <TraceSection trace={inv.trace} running={running} />
    </>
  )
}

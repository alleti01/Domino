import { CASE_KIND, RUN_MODE, RUN_STATUS, VERDICT } from '../../../lib/labels'
import { href, navigate, type ReportView } from '../../../lib/router'
import type { CaseEntry, Investigation, RunEntry } from '../../../types'
import { changeInWords, fmtDate, fmtDuration, isExample, shortRun } from '../../derive'
import { DIcon } from '../../icons'
import { Alert, ExampleTag, Id, KV, More, PageHeader, Panel, Select, Status, Tabs, Tag, VERDICT_SHORT } from '../../ui'
import { EvidenceTab } from './Evidence'
import { ExperimentsTab } from './Experiments'
import { ActivityTab } from './Activity'
import { PrTab } from './PrComment'
import { SummaryTab } from './tabs'

type TabId = 'summary' | 'evidence' | 'experiments' | 'activity' | 'pr'

// Section names from older links (landing page, README) and the tab that holds them now.
const SECTION_TAB: Record<string, TabId> = {
  summary: 'summary',
  verdict: 'summary',
  evidence: 'evidence',
  path: 'evidence',
  context: 'evidence',
  chain: 'evidence',
  change: 'evidence',
  hypotheses: 'evidence',
  experiments: 'experiments',
  activity: 'activity',
  models: 'activity',
  receipts: 'activity',
  nemotron: 'activity',
  timeline: 'activity',
  audit: 'activity',
  trace: 'activity',
}

function tabFor(view: ReportView, section: string | null): TabId {
  if (view === 'pr') return 'pr'
  return (section && SECTION_TAB[section]) || 'summary'
}

function RunPicker({ caseEntry, run }: { caseEntry: CaseEntry; run: RunEntry }) {
  if (caseEntry.runs.length < 2) return null
  return (
    <Select
      label="Run"
      prefix="Run"
      align="right"
      value={run.runId}
      onChange={(id) => navigate(href.case(caseEntry.id, { runId: id }))}
      options={caseEntry.runs.map((r, i) => ({
        value: r.runId,
        text: `${shortRun(r.runId)} ${fmtDate(r.startedAt)}${i === 0 ? ' latest' : ''}`,
        tone: r.verdict ? VERDICT[r.verdict].tone : RUN_STATUS[r.status].tone,
        label: <span className="mono">{shortRun(r.runId)}</span>,
        hint: (
          <>
            {fmtDate(r.startedAt)}
            {r.runMode !== 'full' ? ` · ${RUN_MODE[r.runMode].label}` : ''}
          </>
        ),
        badge: i === 0 ? 'Latest' : undefined,
      }))}
    />
  )
}

function Rail({ inv, caseEntry, run }: { inv: Investigation; caseEntry: CaseEntry; run: RunEntry }) {
  const commands = [...new Map(inv.experiments.filter((x) => x.reproduce).map((x) => [x.variant, x.reproduce!])).entries()]
  return (
    <aside>
      <Panel title="Details">
        <KV
          items={[
            ['Status', <Status tone={RUN_STATUS[inv.status].tone} pulse={inv.status === 'running'}>{RUN_STATUS[inv.status].label}</Status>],
            ['Started', fmtDate(inv.startedAt, true)],
            ['Duration', fmtDuration(inv.durationMs)],
            ['Run ID', <Id copy>{inv.runId}</Id>],
          ]}
        />
        <div className="dx-mt">
          <More summary="More details">
            <KV
              items={[
                ['Change', <Id copy>{inv.change?.changeId ?? '—'}</Id>],
                ['System', caseEntry.label],
                ['Mode', RUN_MODE[inv.runMode].label],
                ['Recording', run.replay ? 'Replayed from an earlier recording' : 'Recorded from a live run'],
                ['Case type', CASE_KIND[caseEntry.kind]],
              ]}
            />
          </More>
        </div>
      </Panel>
      {caseEntry.runs.length > 1 && (
        <Panel title="Runs of this change" flush>
          <ul className="dx-runlist">
            {caseEntry.runs.map((r) => (
              <li key={r.runId}>
                <a href={href.case(caseEntry.id, { runId: r.runId })} aria-current={r.runId === run.runId ? 'true' : undefined}>
                  <span className={`dx-dot tone-${r.verdict ? VERDICT[r.verdict].tone : RUN_STATUS[r.status].tone}`} title={r.verdict ? VERDICT[r.verdict].label : RUN_STATUS[r.status].label} />
                  <span className="dx-id">{shortRun(r.runId)}</span>
                  <span className="dx-faint">{fmtDate(r.startedAt)}</span>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {commands.length > 0 && (
        <section className="dx-panel">
          <More summary="Reproduce locally">
            <div style={{ display: 'grid', gap: 10 }}>
              {commands.map(([variant, cmd]) => (
                <div key={variant}>
                  <div className="dx-faint" style={{ fontSize: 12, marginBottom: 4 }}>
                    {variant}
                  </div>
                  <code className="mono" style={{ display: 'block', overflowWrap: 'anywhere', color: 'var(--dx-ink-2)' }}>
                    {cmd}
                  </code>
                </div>
              ))}
            </div>
          </More>
        </section>
      )}
    </aside>
  )
}

export function Report({
  caseEntry,
  run,
  view,
  section,
  runParam,
}: {
  caseEntry: CaseEntry
  run: RunEntry
  view: ReportView
  section: string | null
  runParam: string | null
}) {
  if (!run.load.ok) {
    return (
      <>
        <PageHeader title={caseEntry.label} meta={<Id>{run.runId}</Id>} />
        <Alert tone="fail" icon="alert">
          <strong>This run couldn’t be read.</strong> {run.load.error}
        </Alert>
      </>
    )
  }
  const inv = run.load.investigation
  const tab = tabFor(view, section)
  const v = inv.verdict ? VERDICT[inv.verdict.verdict] : null
  const at = (s: TabId) =>
    s === 'pr' ? href.case(caseEntry.id, { view: 'pr', runId: runParam }) : href.case(caseEntry.id, { runId: runParam, section: s === 'summary' ? null : s })

  return (
    <>
      <PageHeader
        title={inv.change?.title ?? caseEntry.label}
        lede={changeInWords(inv)}
        meta={
          <>
            {tab === 'summary' && inv.verdict ? null : v ? (
              <span className={`dx-pill tone-${v.tone}`} title={v.label}>
                <span className="dx-dot" aria-hidden="true" />
                {VERDICT_SHORT[inv.verdict!.verdict]}
              </span>
            ) : (
              <span className="dx-pill">
                <Status tone={RUN_STATUS[inv.status].tone} pulse={inv.status === 'running'}>
                  {RUN_STATUS[inv.status].label}
                </Status>
              </span>
            )}
            {isExample(caseEntry.kind) && <ExampleTag />}
            <span>{caseEntry.label}</span>
            <span>{fmtDate(inv.startedAt)}</span>
            {run.replay && <Tag>Replay</Tag>}
            {inv.runMode !== 'full' && <Tag tone="warn">{RUN_MODE[inv.runMode].label}</Tag>}
          </>
        }
        actions={
          <>
            <RunPicker caseEntry={caseEntry} run={run} />
            <a className="dx-btn" href={at('pr')}>
              <DIcon name="pr" size={14} /> PR comment
            </a>
          </>
        }
      />

      {inv.isPlaceholder && (
        <Alert tone="warn" icon="alert">
          <strong>Placeholder.</strong> This layout sample is not a Domino result.
        </Alert>
      )}
      {inv.status === 'outage' && (
        <Alert tone="warn" icon="alert">
          <strong>Outage.</strong> A service the run depends on was unavailable; this run is excluded from scoring.
        </Alert>
      )}

      <Tabs
        current={tab}
        tabs={[
          { id: 'summary', label: 'Summary', href: at('summary') },
          { id: 'evidence', label: 'Evidence', href: at('evidence') },
          { id: 'experiments', label: 'Experiments', href: at('experiments') },
          { id: 'activity', label: 'Activity', href: at('activity') },
          { id: 'pr', label: 'PR comment', href: at('pr') },
        ]}
      />

      {tab === 'summary' && (
        <div className="dx-split">
          <SummaryTab inv={inv} caseEntry={caseEntry} runParam={runParam} />
          <Rail inv={inv} caseEntry={caseEntry} run={run} />
        </div>
      )}
      {tab === 'evidence' && <EvidenceTab key={inv.runId} inv={inv} />}
      {tab === 'experiments' && <ExperimentsTab key={inv.runId} inv={inv} />}
      {tab === 'activity' && <ActivityTab inv={inv} />}
      {tab === 'pr' && <PrTab inv={inv} runParam={runParam} />}

      {inv.warnings.length > 0 && (
        <section className="dx-panel dx-mt">
          <More summary={<span className="dx-muted">{inv.warnings.length} parse warning{inv.warnings.length === 1 ? '' : 's'} in this trace</span>}>
            <ul className="dx-list mono">
              {inv.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </More>
        </section>
      )}
    </>
  )
}

// Runs: every saved run, newest first, laid out like a CI run list. One row per
// run: its result as an icon, the change it investigated, and quiet columns for
// the review, model calls, duration and start time.

import { useMemo, useState } from 'react'
import { isNemotron, RUN_MODE } from '../../lib/labels'
import type { LatestState } from '../../lib/report'
import { href } from '../../lib/router'
import type { RunEntry, RunMode, SiteData } from '../../types'
import { allRuns, changeTitle, fmtDate, fmtDuration, isExample, shortRun, type RunRow } from '../derive'
import { Empty, ExampleTag, PageHeader, Panel, rowLink, SearchInput, Seg, Select, StateMark, Status } from '../ui'

type ResultFilter = 'all' | 'reproduced_failure' | 'no_failure_observed' | 'inconclusive' | 'other'

/** A run's result in the same vocabulary as a change's latest state. */
function runState(run: RunEntry): LatestState {
  if (!run.load.ok) return 'unreadable'
  if (run.verdict) return run.verdict
  if (run.status === 'running') return 'incomplete'
  if (run.status === 'stopped') return 'stopped'
  if (run.status === 'outage') return 'outage'
  return 'failed'
}

export function RunsTable({ rows }: { rows: RunRow[] }) {
  if (rows.length === 0)
    return (
      <Empty icon="runs" title="No runs match">
        Clear the search or pick another filter.
      </Empty>
    )
  const oneMode = new Set(rows.map((r) => r.run.runMode)).size === 1
  return (
    <div className="dx-table-wrap">
      <table className="dx-table dx-inv dx-runs">
        <thead>
          <tr>
            <th>Run</th>
            <th>Explanation</th>
            <th className="t-num">Model calls</th>
            <th className="t-num">Duration</th>
            <th className="t-num">Started</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ caseEntry, run, inv }) => {
            const link = href.case(caseEntry.id, { runId: run.runId })
            const calls = inv?.receipts.length ?? 0
            const nemo = inv?.receipts.filter((r) => r.routedModel && isNemotron(r.routedModel)).length ?? 0
            const review = inv?.review?.outcome
            return (
              <tr key={run.runId} {...rowLink(link)}>
                <td>
                  <span className="dx-runs-main">
                    <StateMark state={runState(run)} label={false} />
                    <span className="dx-runs-text">
                      <a className="t-title" href={link}>
                        {changeTitle(inv, caseEntry.label)}
                      </a>
                      <span className="t-sub">
                        {caseEntry.label} · <span className="dx-id">{shortRun(run.runId)}</span>
                        {!oneMode && run.runMode !== 'full' && <> · {RUN_MODE[run.runMode].label}</>}
                        {run.replay && <> · replay</>}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="t-nowrap">
                  {review === 'approved' ? (
                    <Status tone="ok">Approved</Status>
                  ) : review === 'flagged' || review === 'sent_back' ? (
                    <Status tone="warn">Flagged</Status>
                  ) : (
                    <span className="dx-faint">—</span>
                  )}
                </td>
                <td className="t-num t-nowrap">
                  {calls ? (
                    <span title={`${nemo} of ${calls} answered by Nemotron`}>
                      {calls}
                      {nemo < calls && <span className="dx-faint"> · {nemo} Nemotron</span>}
                    </span>
                  ) : (
                    <span className="dx-faint">—</span>
                  )}
                </td>
                <td className="t-num t-nowrap">{fmtDuration(inv?.durationMs)}</td>
                <td className="t-num t-nowrap dx-faint">{fmtDate(run.startedAt)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const PAGE = 50

export function Runs({ site }: { site: SiteData }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<ResultFilter>('all')
  const [mode, setMode] = useState<RunMode | 'all'>('all')
  const [limit, setLimit] = useState(PAGE)
  const runs = useMemo(() => allRuns(site), [site])
  const modes = [...new Set(runs.map((r) => r.run.runMode))]

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return runs.filter(({ run, caseEntry, inv }) => {
      if (mode !== 'all' && run.runMode !== mode) return false
      if (result === 'other' ? !!run.verdict : result !== 'all' && run.verdict !== result) return false
      if (!q) return true
      return [run.runId, caseEntry.label, caseEntry.id, inv?.change?.title].some((s) => s?.toLowerCase().includes(q))
    })
  }, [runs, query, result, mode])

  const n = (f: ResultFilter) => runs.filter((r) => (f === 'other' ? !r.run.verdict : r.run.verdict === f)).length
  const options: { value: ResultFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: runs.length },
    { value: 'reproduced_failure', label: 'Breaks', count: n('reproduced_failure') },
    { value: 'no_failure_observed', label: 'No failure', count: n('no_failure_observed') },
    { value: 'inconclusive', label: 'Inconclusive', count: n('inconclusive') },
    { value: 'other', label: 'No verdict', count: n('other') },
  ]

  return (
    <>
      <PageHeader
        title="Runs"
        count={runs.length}
        sub="Every saved investigation run, newest first. Repeats of the same change are separate runs."
        meta={site.cases.some((c) => isExample(c.kind)) ? <ExampleTag /> : undefined}
      />
      <Panel flush>
        <div className="dx-toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Search runs" />
          <Seg<ResultFilter> label="Result" value={result} onChange={setResult} options={options.filter((o) => o.value === 'all' || o.count > 0)} />
          {modes.length > 1 && (
            <Select<RunMode | 'all'>
              label="Mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'all', text: 'All modes', label: 'All modes' },
                ...modes.map((m) => ({ value: m, text: RUN_MODE[m].label, label: RUN_MODE[m].label, hint: RUN_MODE[m].description })),
              ]}
            />
          )}
          {rows.length !== runs.length && (
            <span className="dx-toolbar-end dx-num">
              {rows.length} of {runs.length}
            </span>
          )}
        </div>
        <RunsTable rows={rows.slice(0, limit)} />
        {rows.length > limit && (
          <div className="dx-panel-foot dx-row">
            <span>
              Showing {limit} of {rows.length}
            </span>
            <button type="button" className="dx-btn dx-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setLimit((l) => l + PAGE)}>
              Show more
            </button>
          </div>
        )}
      </Panel>
    </>
  )
}

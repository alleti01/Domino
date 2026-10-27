// Investigations: every change in one table. One line per change, the verdict
// as an icon and a word, repeats as squares, and what moved as two small bars
// against the limit instead of a raw metric key.

import { useMemo, useState } from 'react'
import { filterCases, latestState, type LatestState } from '../../lib/report'
import { href } from '../../lib/router'
import { experimentSummary, type ExperimentSummary } from '../../lib/showcase'
import type { CaseEntry, SiteData } from '../../types'
import { agreement, fmtDate, fmtValue, isExample, latestInv } from '../derive'
import { DIcon } from '../icons'
import { Empty, ExampleTag, humanize, PageHeader, Panel, Pips, rowLink, SearchInput, Seg, StateMark } from '../ui'

type Filter = LatestState | 'all' | 'attention'
type SortKey = 'change' | 'verdict' | 'last'

const STATE_ORDER: LatestState[] = ['reproduced_failure', 'inconclusive', 'incomplete', 'failed', 'outage', 'unreadable', 'no_failure_observed', 'none']

function needsAttention(c: CaseEntry) {
  const a = agreement(c)
  const s = latestState(c)
  return a.agreeing < a.decided || !['reproduced_failure', 'no_failure_observed'].includes(s)
}

/** Without vs with the change as two thin bars, with the limit as a tick. Text when values aren't numbers. */
function Moved({ x }: { x: ExperimentSummary }) {
  const b = x.baseline
  const c = x.candidate
  const limit = x.limit?.value ?? null
  const name = humanize(x.key).name
  if (typeof b !== 'number' || typeof c !== 'number') {
    return (
      <span className="dx-moved-text" title={x.key}>
        {name}: {fmtValue(b)} → {fmtValue(c)}
      </span>
    )
  }
  const max = Math.max(b, c, limit ?? 0) * 1.1 || 1
  const w = (v: number) => `${Math.max(2, (v / max) * 100)}%`
  return (
    <span className="dx-moved" title={`${x.key}: ${fmtValue(b)} without the change, ${fmtValue(c)} with it${limit != null ? `, limit ${fmtValue(limit)}` : ''}`}>
      <span className="dx-moved-name">{name}</span>
      <span className="dx-moved-bars">
        <span className="dx-moved-track">
          <span className="dx-moved-bar" style={{ width: w(b) }} />
          {limit != null && <span className="dx-moved-limit" style={{ left: w(limit) }} />}
        </span>
        <span className="dx-moved-track">
          <span className={`dx-moved-bar${x.candidateFailed ? ' is-bad' : ' is-new'}`} style={{ width: w(c) }} />
          {limit != null && <span className="dx-moved-limit" style={{ left: w(limit) }} />}
        </span>
      </span>
      <span className="dx-moved-vals dx-num">
        {fmtValue(b)} → <b className={x.candidateFailed ? 'is-bad' : undefined}>{fmtValue(c)}</b>
      </span>
    </span>
  )
}

export function Investigations({ site }: { site: SiteData }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'verdict', asc: true })

  const count = (s: LatestState) => site.cases.filter((c) => latestState(c) === s).length
  const rows = useMemo(() => {
    const base = filter === 'attention' ? filterCases(site.cases, query, 'all').filter(needsAttention) : filterCases(site.cases, query, filter)
    const dir = sort.asc ? 1 : -1
    const title = (c: CaseEntry) => latestInv(c)?.change?.title ?? c.label
    return [...base].sort((a, b) => {
      if (sort.key === 'change') return dir * title(a).localeCompare(title(b))
      if (sort.key === 'last') return dir * (a.runs[0]?.startedAt ?? '').localeCompare(b.runs[0]?.startedAt ?? '')
      return dir * (STATE_ORDER.indexOf(latestState(a)) - STATE_ORDER.indexOf(latestState(b))) || a.label.localeCompare(b.label)
    })
  }, [site.cases, query, filter, sort])

  const sortBtn = (key: SortKey, label: string) => (
    <button
      type="button"
      className="dx-sort"
      data-dir={sort.key === key ? (sort.asc ? 'asc' : 'desc') : undefined}
      onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}
      aria-label={`Sort by ${label}`}
    >
      {label}
      {sort.key === key && <DIcon name="chevron-down" size={12} className={sort.asc ? 'dx-flip' : undefined} />}
    </button>
  )

  const attention = site.cases.filter(needsAttention).length
  return (
    <>
      <PageHeader
        title="Investigations"
        count={site.cases.length}
        sub="One row per proposed change. The verdict is the deterministic judge’s, from sandbox runs of the system without the change, with it, and with it reverted."
        meta={site.cases.some((c) => isExample(c.kind)) ? <ExampleTag /> : undefined}
      />
      <Panel flush>
        <div className="dx-toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Search changes" />
          <Seg<Filter>
            label="Latest verdict"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: site.cases.length },
              { value: 'reproduced_failure', label: 'Breaks', count: count('reproduced_failure') },
              { value: 'no_failure_observed', label: 'No failure', count: count('no_failure_observed') },
              ...(count('inconclusive') ? [{ value: 'inconclusive' as Filter, label: 'Inconclusive', count: count('inconclusive') }] : []),
              ...(attention ? [{ value: 'attention' as Filter, label: 'Needs attention', count: attention }] : []),
            ]}
          />
          {rows.length !== site.cases.length && (
            <span className="dx-toolbar-end dx-num">
              {rows.length} of {site.cases.length}
            </span>
          )}
        </div>
        {rows.length === 0 ? (
          <Empty icon="filter" title="No changes match">
            Clear the search or pick another filter.
          </Empty>
        ) : (
          <div className="dx-table-wrap">
            <table className="dx-table dx-inv">
              <thead>
                <tr>
                  <th>{sortBtn('change', 'Change')}</th>
                  <th>{sortBtn('verdict', 'Verdict')}</th>
                  <th>Repeats</th>
                  <th>What moved</th>
                  <th className="t-num">{sortBtn('last', 'Last run')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const inv = latestInv(c)
                  const a = agreement(c)
                  const x = inv ? experimentSummary(inv) : null
                  const link = href.case(c.id)
                  const flagged = inv?.review && (inv.review.outcome === 'flagged' || inv.review.outcome === 'sent_back')
                  return (
                    <tr key={c.id} {...rowLink(link)}>
                      <td className="dx-inv-change">
                        <a className="t-title" href={link}>
                          {inv?.change?.title ?? c.label}
                        </a>
                        <span className="t-sub">
                          {c.label}
                          {flagged && <span className="dx-inv-note"> · explanation flagged</span>}
                          {a.agreeing < a.decided && <span className="dx-inv-note"> · repeats disagree</span>}
                        </span>
                      </td>
                      <td className="t-nowrap">
                        <StateMark state={latestState(c)} />
                      </td>
                      <td className="t-nowrap">
                        {a.decided > 1 ? (
                          <span className="dx-row" style={{ gap: 8 }} title={`${a.agreeing} of ${a.decided} runs agree`}>
                            <Pips verdicts={a.verdicts} />
                            <span className="dx-faint dx-num">
                              {a.agreeing}/{a.decided}
                            </span>
                          </span>
                        ) : (
                          <span className="dx-faint">{a.decided === 1 ? '1 run' : '—'}</span>
                        )}
                      </td>
                      <td>{x ? <Moved x={x} /> : <span className="dx-faint">—</span>}</td>
                      <td className="t-num t-nowrap dx-faint">{fmtDate(c.runs[0]?.startedAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}

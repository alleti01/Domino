import { useMemo, useState } from 'react'
import type { CaseEntry, CaseKind, SiteData } from '../types'
import { CASE_KIND, RUN_MODE, VERDICT, formatMs } from '../lib/labels'
import { experimentSummary } from '../lib/showcase'
import { filterCases, latestState, type LatestState } from '../lib/report'
import { href } from '../lib/router'
import { plural } from '../lib/runs'
import { Ident, PlaceholderNotice, StateMark } from './common'
import { Icon } from './Icon'
import { MiniMap } from './report/MiniMap'

const STATE_LABEL: Record<LatestState, string> = {
  reproduced_failure: VERDICT.reproduced_failure.label,
  no_failure_observed: VERDICT.no_failure_observed.label,
  inconclusive: VERDICT.inconclusive.label,
  incomplete: 'No verdict in trace',
  failed: 'Run failed',
  outage: 'Outage',
  unreadable: 'Unreadable',
  none: 'No runs',
}

// Short classification for the index; the full wording is in each report.
const KIND_SHORT: Record<CaseKind, string> = {
  inspired: 'Incident simulation',
  held_out: 'Held-out case',
  'safe': 'False-alarm check',
  practice: 'Practice run',
  other: 'Unassigned',
}

/** One sentence about what is loaded, from the cases themselves. */
function describe(cases: CaseEntry[]) {
  const kinds = [...new Set(cases.map((c) => c.kind))]
  const runs = cases.reduce((n, c) => n + c.runs.length, 0)
  const what = kinds.length === 1 ? `${CASE_KIND[kinds[0]].split(',')[0].toLowerCase()}s` : 'cases'
  return `${plural(cases.length, 'investigation')} (${plural(runs, 'saved run')}), all ${what} on synthetic systems. Each opens to its verdict, the experiments behind it, and the full audit trail.`
}

/** Dashboard home: each investigation as a framed panel drawn from its own graph and experiments. */
export function CasesView({ site }: { site: SiteData }) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState<LatestState | 'all'>('all')
  const shown = useMemo(() => filterCases(site.cases, query, state), [site.cases, query, state])

  // Only offer filters for states that actually occur.
  const counts = new Map<LatestState, number>()
  for (const c of site.cases) counts.set(latestState(c), (counts.get(latestState(c)) ?? 0) + 1)

  return (
    <article className="page" aria-labelledby="page-title">
      {site.isPlaceholder && <PlaceholderNotice />}
      <header className="page-head is-split">
        <div>
          <p className="kicker">Domino · investigation lab</p>
          <h1 id="page-title">Investigations</h1>
        </div>
        <p className="page-lede">{describe(site.cases)}</p>
      </header>

      <div className="toolbar" role="search">
        <div className="search">
          <Icon name="search" size={15} />
          <label className="visually-hidden" htmlFor="case-search">
            Search investigations
          </label>
          <input
            id="case-search"
            type="search"
            placeholder="Search by change, case or ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="seg seg-filter" role="group" aria-label="Filter by latest verdict">
          <button type="button" aria-pressed={state === 'all'} onClick={() => setState('all')}>
            All <span className="count">{site.cases.length}</span>
          </button>
          {[...counts].map(([s, n]) => (
            <button key={s} type="button" aria-pressed={state === s} onClick={() => setState(s)} className={`state-${s}`}>
              <span className="dot" aria-hidden="true" />
              {STATE_LABEL[s]} <span className="count">{n}</span>
            </button>
          ))}
        </div>
        <p className="toolbar-count" role="status">
          {shown.length === site.cases.length ? plural(shown.length, 'investigation') : `${shown.length} of ${site.cases.length} shown`}
        </p>
      </div>

      {shown.length === 0 ? (
        <div className="bench">
          <div className="cell index-empty">
            <p>No investigation matches {query ? <>“{query}”</> : 'this filter'}.</p>
            <button
              type="button"
              className="button"
              onClick={() => {
                setQuery('')
                setState('all')
              }}
            >
              Clear search and filter
            </button>
          </div>
        </div>
      ) : (
        <ul className="catalog" aria-label="Investigations">
          {shown.map((c) => (
            <CatalogPanel key={c.id} c={c} />
          ))}
        </ul>
      )}

      <p className="index-foot">
        <a href={href.results}>
          Results across all cases <Icon name="arrow-right" size={14} />
        </a>
        <a href={href.underTheHood}>
          System proof <Icon name="arrow-right" size={14} />
        </a>
      </p>
    </article>
  )
}

/** The investigation's one deciding comparison, from its own runs. */
function Reading({ c }: { c: CaseEntry }) {
  const latest = c.runs[0]
  const inv = latest?.load.ok ? latest.load.investigation : null
  const sum = inv ? experimentSummary(inv) : null
  if (!inv || !sum) return <p className="panel-reading muted">No experiment readings in the latest run.</p>
  const cands = inv.experiments.filter((x) => x.variant === 'candidate' && x.completed)
  const failing = cands.filter((x) => x.assertions.some((a) => !a.passed))
  const failedNames = [...new Set(failing.flatMap((x) => x.assertions.filter((a) => !a.passed).map((a) => a.name)))]
  const arms = [
    ['Baseline', sum.baseline],
    ['Candidate', sum.candidate],
    ['Control', sum.control],
  ].filter(([, v]) => v != null) as [string, string | number | boolean][]
  return (
    <div className="panel-reading">
      <p className="kicker">
        <Ident name={sum.key} />
      </p>
      <dl className="panel-arms">
        {arms.map(([label, v]) => (
          <div key={label} className={label === 'Candidate' && failing.length ? 'is-fail' : undefined}>
            <dt>{label}</dt>
            <dd>{String(v)}</dd>
          </div>
        ))}
      </dl>
      <p className="panel-check">
        {cands.length === 0 ? (
          <span className="muted">No candidate run finished.</span>
        ) : failing.length > 0 ? (
          <span className="tone-text-fail">
            <Icon name="x" size={13} /> <Ident name={failedNames.join(', ')} /> failed in {failing.length} of {plural(cands.length, 'candidate run')}
          </span>
        ) : (
          <span className="tone-text-ok">
            <Icon name="check" size={13} /> Every check passed in {plural(cands.length, 'candidate run')}
          </span>
        )}
      </p>
    </div>
  )
}

function CatalogPanel({ c }: { c: CaseEntry }) {
  const latest = c.runs[0]
  const inv = latest?.load.ok ? latest.load.investigation : null
  const title = inv?.change?.title ?? c.label
  const state = latestState(c)
  return (
    <li className={`panel state-${state}`}>
      <header className="panel-top">
        <span className="kicker">{KIND_SHORT[c.kind]}</span>
        <span className="kicker">
          <code>{c.id}</code>
        </span>
      </header>
      <div className="panel-main">
        <h2 className="panel-title">
          <a href={href.case(c.id)}>{title}</a>
        </h2>
        {title !== c.label && <p className="panel-sub">{c.label}</p>}
        <StateMark state={state} />
      </div>
      <div className="panel-figure">{inv ? <MiniMap inv={inv} /> : <div className="minimap is-empty">No readable run</div>}</div>
      <Reading c={c} />
      <footer className="panel-foot">
        <div className="panel-meta">
          {latest && (
            <span>
              {latest.runMode !== 'full' ? RUN_MODE[latest.runMode].label : latest.replay ? 'Replayed recording' : 'Recorded live'}
              {inv?.durationMs != null && ` · ${formatMs(inv.durationMs)}`}
            </span>
          )}
          <span className="panel-runs">
            {plural(c.runs.length, 'run')}
            {c.runs.length > 1 && (
              <span className="run-dots">
                {c.runs.map((r, i) => {
                  const v = r.verdict ? VERDICT[r.verdict] : null
                  return (
                    <a
                      key={r.runId}
                      href={href.case(c.id, { runId: i === 0 ? null : r.runId })}
                      className={`tone-text-${v ? v.tone : 'muted'}`}
                      title={`${r.runId}: ${v ? v.label : 'no verdict'}`}
                    >
                      <Icon name={v ? v.icon : 'clock'} size={14} />
                      <span className="visually-hidden">
                        Run {r.runId}: {v ? v.label : 'no verdict'}
                      </span>
                    </a>
                  )
                })}
              </span>
            )}
          </span>
        </div>
        <div className="panel-actions">
          <a className="button button-quiet" href={href.case(c.id, { view: 'pr' })}>
            PR preview<span className="visually-hidden"> for {title}</span>
          </a>
          <a className="button button-primary" href={href.case(c.id)}>
            Inspect<span className="visually-hidden"> {title}</span> <Icon name="arrow-right" size={14} />
          </a>
        </div>
      </footer>
    </li>
  )
}

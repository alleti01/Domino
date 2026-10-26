import { useState } from 'react'
import type { CaseEntry, Investigation, SiteData } from '../types'
import type { RawZetaris } from '../data/format'
import { formatMs, isNemotron, shortModel } from '../lib/labels'
import { href } from '../lib/router'
import { plural } from '../lib/runs'
import { Breadcrumbs, PlaceholderNotice } from './common'
import { Icon, type IconName } from './Icon'

interface LoadedRun {
  caseEntry: CaseEntry
  runId: string
  /** null when this is the case's latest run, so links stay short. */
  runParam: string | null
  inv: Investigation
}

function loadedRuns(site: SiteData): LoadedRun[] {
  return site.cases.flatMap((c) =>
    c.runs.flatMap((r, i) =>
      r.load.ok ? [{ caseEntry: c, runId: r.runId, runParam: i === 0 ? null : r.runId, inv: r.load.investigation }] : [],
    ),
  )
}

/** Evidence lives inside a run, so cross-page links carry the case and run. */
function evidenceHref(run: LoadedRun, evidence: string) {
  return href.case(run.caseEntry.id, { runId: run.runId, evidence })
}

type ProofTab = 'nemotron' | 'zetaris' | 'meterless'

const TABS: { id: ProofTab; label: string; icon: IconName }[] = [
  { id: 'nemotron', label: 'Nemotron via Nightshift', icon: 'cpu' },
  { id: 'zetaris', label: 'Zetaris', icon: 'database' },
  { id: 'meterless', label: 'Meterless World Model', icon: 'layers' },
]

/** One sponsor technology at a time: its role in an investigation, and the recorded proof. */
export function UnderTheHoodView({ site, section }: { site: SiteData; section: string | null }) {
  const tab: ProofTab = TABS.some((t) => t.id === section) ? (section as ProofTab) : 'nemotron'
  const runs = loadedRuns(site)
  const totalRuns = site.cases.reduce((n, c) => n + c.runs.length, 0)

  return (
    <article className="page" aria-labelledby="page-title">
      {site.isPlaceholder && <PlaceholderNotice />}
      <header className="page-head">
        <Breadcrumbs items={[{ label: 'Investigations', href: href.cases }, { label: 'System proof' }]} />
        <h1 id="page-title">System proof</h1>
        <p className="page-lede">
          What each sponsor technology does in an investigation, with proof taken from{' '}
          {runs.length === totalRuns ? `all ${plural(totalRuns, 'saved run')}` : `${runs.length} of ${plural(totalRuns, 'saved run')}`}.
          Every row links back to the run it came from.
        </p>
      </header>

      <nav className="report-tabs proof-tabs" aria-label="Technologies">
        <ul>
          {TABS.map((t) => (
            <li key={t.id}>
              <a href={href.underTheHoodAt(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
                <Icon name={t.icon} size={15} />
                {t.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div id={tab}>
        {tab === 'nemotron' && <ReceiptLog runs={runs} />}
        {tab === 'zetaris' && <ZetarisProof zetaris={site.zetaris} runs={runs} />}
        {tab === 'meterless' && <MemoryProof runs={runs} />}
      </div>

      {site.warnings.length > 0 && (
        <details className="side-details">
          <summary>
            <Icon name="alert" size={14} /> {plural(site.warnings.length, 'data warning')} while loading
          </summary>
          <ul className="plain-bullets small">
            {site.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </article>
  )
}

function Stats({ items }: { items: [string | number, string][] }) {
  return (
    <ul className="proof-stats">
      {items.map(([n, label]) => (
        <li key={label}>
          <strong>{n}</strong>
          <span>{label}</span>
        </li>
      ))}
    </ul>
  )
}

function ReceiptLog({ runs }: { runs: LoadedRun[] }) {
  const [only, setOnly] = useState<'all' | 'other'>('all')
  const all = runs.flatMap((run) => run.inv.receipts.map((r) => ({ run, r })))
  const nemotron = all.filter(({ r }) => r.routedModel && isNemotron(r.routedModel)).length
  const failed = all.filter(({ r }) => r.outcome === 'failed').length
  const rows = only === 'all' ? all : all.filter(({ r }) => !r.routedModel || !isNemotron(r.routedModel) || r.outcome === 'failed')

  return (
    <section className="stack" aria-labelledby="nemotron-title">
      <div className="block">
        <h2 id="nemotron-title" className="block-title">
          NVIDIA Nemotron through Meterless Nightshift
        </h2>
        <p className="proof-role">
          Nemotron plans each investigation, chooses the experiments and writes the explanation. Every call goes through
          Nightshift, which reports the model that actually answered; that routing is recorded below. The verdict itself
          comes from the deterministic judge, not from the model.
        </p>
        <Stats
          items={[
            [all.length, 'model calls recorded'],
            [nemotron, 'routed to Nemotron'],
            [failed, 'failed after retries'],
            [runs.length, 'runs'],
          ]}
        />
      </div>

      <div className="block">
        <div className="filter-row">
          <label>
            Show
            <select value={only} onChange={(e) => setOnly(e.target.value as 'all' | 'other')}>
              <option value="all">Every call</option>
              <option value="other">Only failed or not Nemotron</option>
            </select>
          </label>
          <span>{plural(rows.length, 'call')}</span>
        </div>
        {rows.length === 0 ? (
          <div className="pending-state">
            <strong>{all.length === 0 ? 'No model calls recorded yet' : 'Nothing to show'}</strong>
            <span>
              {all.length === 0
                ? 'Calls appear here once a saved run includes them.'
                : 'Every recorded call was routed to Nemotron and succeeded.'}
            </span>
          </div>
        ) : (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Receipt log">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Case · run</th>
                  <th scope="col">Step</th>
                  <th scope="col">Routed model</th>
                  <th scope="col">Request</th>
                  <th scope="col" className="num">
                    Latency
                  </th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ run, r }) => (
                  <tr key={`${run.runId}-${r.stepId}`}>
                    <td>
                      <a href={href.case(run.caseEntry.id, { runId: run.runParam, section: 'receipts' })}>{run.caseEntry.label}</a>
                      <span className="cell-sub">
                        {run.runId}
                        {run.inv.replay && ' · replayed recording'}
                      </span>
                    </td>
                    <td>{r.step}</td>
                    <td>
                      {r.routedModel ? <code>{shortModel(r.routedModel)}</code> : <span className="muted">not routed</span>}
                      {r.routedModel && !isNemotron(r.routedModel) && <span className="cell-sub warn-text">not Nemotron</span>}
                    </td>
                    <td>
                      <a href={evidenceHref(run, r.stepId)}>
                        <code className="wrap-id">{r.id}</code>
                      </a>
                      {r.receiptId && <span className="cell-sub">receipt {r.receiptId}</span>}
                    </td>
                    <td className="num">{formatMs(r.latencyMs)}</td>
                    <td>
                      {r.outcome === 'ok' ? (
                        <span className="outcome tone-ok">
                          <Icon name="check-circle" size={14} /> OK
                        </span>
                      ) : (
                        <span className="outcome tone-fail">
                          <Icon name="x-circle" size={14} /> Failed
                        </span>
                      )}
                      {r.attempts > 1 && <span className="cell-sub">{r.attempts} attempts</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="side-note">Shows routing only. Prompts, tokens and API keys are never stored or shown.</p>
      </div>
    </section>
  )
}

function ZetarisProof({ zetaris, runs }: { zetaris: RawZetaris | null; runs: LoadedRun[] }) {
  const queries = runs.reduce((n, run) => n + run.inv.trace.filter((t) => t.type === 'usl_query').length, 0)
  const rowsCited = runs.reduce((n, run) => n + [...run.inv.evidence.values()].filter((e) => e.kind === 'row').length, 0)

  return (
    <section className="stack" aria-labelledby="zetaris-title">
      <div className="block">
        <h2 id="zetaris-title" className="block-title">
          Zetaris unified semantic layer
        </h2>
        <p className="proof-role">
          Separate data sources are onboarded into Zetaris and compiled into
          one semantic layer. The agent queries it with a read-only login to find the dependency paths no single source
          holds, and every row it relies on is cited as evidence.
        </p>
        <Stats
          items={[
            [queries, 'semantic-layer queries in saved runs'],
            [rowsCited, 'rows cited as evidence'],
          ]}
        />
      </div>

      {!zetaris ? (
        <div className="pending-state">
          <strong>Setup details not exported yet</strong>
          <span>
            The onboarded sources, the compiled layer and data-quality results appear here once they are exported. The
            queries and rows above come from the saved runs themselves.
          </span>
        </div>
      ) : (
        <>
          <div className="block">
            <h3 className="block-title">Sources onboarded</h3>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Zetaris sources">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Source</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Tables</th>
                    <th scope="col" className="num">
                      Rows
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {zetaris.sources.map((s) => (
                    <tr key={s.source_id}>
                      <th scope="row">{s.name}</th>
                      <td>{s.kind}</td>
                      <td>{s.tables.length ? s.tables.map((t) => <code key={t}>{t} </code>) : '—'}</td>
                      <td className="num">{s.row_count ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="block">
            <h3 className="block-title">Semantic layer compiled</h3>
            <p>
              <code>{zetaris.usl.name}</code>{' '}
              <span className={`outcome tone-${zetaris.usl.compile_status === 'success' ? 'ok' : 'fail'}`}>
                <Icon name={zetaris.usl.compile_status === 'success' ? 'check-circle' : 'x-circle'} size={14} />
                {zetaris.usl.compile_status === 'success' ? 'Compiled' : `Compile ${zetaris.usl.compile_status}`}
              </span>
              {zetaris.compiled_at && <span className="small muted"> · {zetaris.compiled_at}</span>}
            </p>
            {zetaris.usl.relationships.length > 0 && (
              <ul className="plain-bullets small">
                {zetaris.usl.relationships.map((r, i) => (
                  <li key={i}>
                    <code>{r.from}</code> → <code>{r.to}</code> via <code>{r.via}</code>
                  </li>
                ))}
              </ul>
            )}
            <details className="side-details">
              <summary>Compiler output</summary>
              <pre className="field-block">{zetaris.usl.compile_output}</pre>
            </details>
          </div>

          <div className="block">
            <h3 className="block-title">Data-quality rules</h3>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Data-quality rules">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Rule</th>
                    <th scope="col">Result</th>
                    <th scope="col">Rejected rows</th>
                  </tr>
                </thead>
                <tbody>
                  {zetaris.dq_rules.map((r) => (
                    <tr key={r.rule_id}>
                      <th scope="row">
                        {r.name}
                        <span className="cell-sub">
                          <code>{r.expression}</code>
                        </span>
                      </th>
                      <td>
                        <span className={`outcome tone-${r.status === 'pass' ? 'ok' : 'fail'}`}>
                          <Icon name={r.status === 'pass' ? 'check-circle' : 'x-circle'} size={14} />
                          {r.status === 'pass' ? 'Pass' : 'Fail'}
                        </span>
                        {r.checked_rows != null && <span className="cell-sub">{r.checked_rows} rows checked</span>}
                      </td>
                      <td>
                        {r.invalid_rows.length === 0 ? (
                          '—'
                        ) : (
                          <ul className="plain-bullets small">
                            {r.invalid_rows.map((row) => (
                              <li key={`${row.source}-${row.row_id}`}>
                                <code>{row.row_id}</code> <span className="muted">({row.source})</span>: {row.reason}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="side-note">Rejected rows are shown, not silently dropped.</p>
          </div>
        </>
      )}
    </section>
  )
}

const OP_LABEL = { read: 'Read', write: 'Write', update: 'Update' } as const

function MemoryProof({ runs }: { runs: LoadedRun[] }) {
  const [action, setAction] = useState<'all' | keyof typeof OP_LABEL>('all')
  const ops = runs.flatMap((run) => run.inv.memory)
  const engines = [...new Set(ops.map((m) => m.engine))]
  const count = (a: string) => ops.filter((m) => m.action === a).length
  const shown = runs
    .map((run) => ({ run, ops: run.inv.memory.filter((m) => action === 'all' || m.action === action) }))
    .filter((g) => g.ops.length > 0)

  return (
    <section className="stack" aria-labelledby="meterless-title">
      <div className="block">
        <h2 id="meterless-title" className="block-title">
          Meterless Engine: World Model
        </h2>
        <p className="proof-role">
          The investigation's state lives in the Meterless World Model: components and links found, each hypothesis and
          its status, and what earlier investigations recorded. Writes record findings, reads are the agent consulting it
          (including recall across runs), and updates revise a fact while keeping the old one.
          {engines.length > 0 && (
            <>
              {' '}
              Engine: <code>{engines.join(', ')}</code>.
            </>
          )}
        </p>
        <Stats
          items={[
            [count('write'), 'writes'],
            [count('read'), 'reads'],
            [count('update'), 'updates'],
          ]}
        />
      </div>

      <div className="block">
        <div className="filter-row">
          <label>
            Show
            <select value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
              <option value="all">Every operation</option>
              <option value="write">Writes</option>
              <option value="read">Reads</option>
              <option value="update">Updates</option>
            </select>
          </label>
        </div>
        {shown.length === 0 ? (
          <div className="pending-state">
            <strong>{ops.length === 0 ? 'No memory operations recorded yet' : 'None of this kind'}</strong>
            <span>
              {ops.length === 0 ? 'They appear here once a saved run includes them.' : 'Choose another kind of operation.'}
            </span>
          </div>
        ) : (
          <ol className="memory-list">
            {shown.map(({ run, ops: list }) => (
              <li key={run.runId}>
                <a className="memory-run" href={href.case(run.caseEntry.id, { runId: run.runParam })}>
                  {run.caseEntry.label} · <code>{run.runId}</code>
                </a>
                <ul className="memory-ops">
                  {list.map((m) => (
                    <li key={m.stepId}>
                      <span className={`op op-${m.action}`}>{OP_LABEL[m.action as keyof typeof OP_LABEL] ?? m.action}</span>
                      <a href={evidenceHref(run, m.stepId)}>{m.detail}</a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

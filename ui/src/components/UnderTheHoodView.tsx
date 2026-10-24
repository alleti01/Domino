import type { CaseEntry, Investigation, SiteData } from '../types'
import type { RawZetaris } from '../data/format'
import { formatMs, isNemotron, shortModel } from '../lib/labels'
import { href } from '../lib/router'
import { plural } from '../lib/runs'
import { jumpTo } from '../lib/scroll'
import { Badge, Breadcrumbs, PlaceholderNotice, Section } from './common'

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

const SECTIONS = [
  ['nemotron', 'Nemotron receipts'],
  ['zetaris', 'Zetaris'],
  ['meterless', 'Meterless memory'],
] as const

export function UnderTheHoodView({ site }: { site: SiteData }) {
  const runs = loadedRuns(site)
  const totalRuns = site.cases.reduce((n, c) => n + c.runs.length, 0)
  return (
    <article className="page" aria-labelledby="page-title">
      {site.isPlaceholder && <PlaceholderNotice />}
      <header className="page-head">
        <Breadcrumbs items={[{ label: 'Overview', href: href.cases }, { label: 'Under the hood' }]} />
        <div className="page-kicker">Sponsor technology</div>
        <h1 id="page-title">Under the hood</h1>
        <p className="muted">
          How each sponsor technology is used, with proof taken from {runs.length} of {totalRuns} saved runs.
        </p>
      </header>
      <nav className="section-nav" aria-label="Sections">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} onClick={(ev) => jumpTo(ev, id)}>
            {label}
          </a>
        ))}
      </nav>

      <ReceiptLog runs={runs} />
      <ZetarisSection zetaris={site.zetaris} runs={runs} />
      <MemorySection runs={runs} />

      {site.warnings.length > 0 && (
        <section className="warnings" aria-labelledby="file-warnings">
          <h2 id="file-warnings" className="small">
            File warnings
          </h2>
          <ul className="bullets small">
            {site.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}

function ReceiptLog({ runs }: { runs: LoadedRun[] }) {
  const rows = runs.flatMap((run) => run.inv.receipts.map((r) => ({ run, r })))
  const nemotron = rows.filter(({ r }) => r.routedModel && isNemotron(r.routedModel)).length
  const failed = rows.filter(({ r }) => r.outcome === 'failed').length
  const byModel = new Map<string, number>()
  for (const { r } of rows) {
    const m = r.routedModel ?? 'not routed'
    byModel.set(m, (byModel.get(m) ?? 0) + 1)
  }

  return (
    <Section
      id="nemotron"
      title="NVIDIA Nemotron receipt log"
      icon="cpu"
      lede={
        <>
          Every model call goes through Meterless Nightshift, the primary AI provider, which reports the model that
          actually answered. <strong>{nemotron}</strong> of <strong>{rows.length}</strong> calls across{' '}
          {plural(runs.length, 'run')} were routed to Nemotron{failed > 0 && `; ${failed} failed after retries`}.
        </>
      }
    >
      <ul className="model-counts">
        {[...byModel].map(([model, n]) => (
          <li key={model}>
            <code>{shortModel(model)}</code> <span className="muted">· {plural(n, 'call')}</span>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? (
        <p className="pending">No model calls recorded yet.</p>
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
                    <a href={href.case(run.caseEntry.id, { runId: run.runParam, section: 'receipts' })}>
                      {run.caseEntry.label}
                    </a>
                    <span className="th-sub">
                      {run.runId}
                      {run.inv.replay && ' · replay'}
                    </span>
                  </td>
                  <td>{r.step}</td>
                  <td>
                    {r.routedModel ? <code>{shortModel(r.routedModel)}</code> : <span className="muted">not routed</span>}
                    {r.routedModel && !isNemotron(r.routedModel) && <span className="th-sub warn-text">not Nemotron</span>}
                  </td>
                  <td>
                    <a href={evidenceHref(run, r.stepId)}>
                      <code>{r.id}</code>
                    </a>
                    {r.receiptId && <span className="th-sub">receipt {r.receiptId}</span>}
                  </td>
                  <td className="num">{formatMs(r.latencyMs)}</td>
                  <td>
                    {r.outcome === 'ok' ? (
                      <Badge tone="ok" icon="check-circle">
                        OK
                      </Badge>
                    ) : (
                      <Badge tone="fail" icon="x-circle">
                        Failed
                      </Badge>
                    )}
                    {r.attempts > 1 && <span className="th-sub">{r.attempts} attempts</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted fine-print">Shows routing only. Prompts, tokens and API keys are never stored or shown.</p>
    </Section>
  )
}

function ZetarisSection({ zetaris, runs }: { zetaris: RawZetaris | null; runs: LoadedRun[] }) {
  const queries = runs.flatMap((run) => run.inv.trace.filter((t) => t.type === 'usl_query'))
  const rowsCited = runs.reduce((n, run) => n + [...run.inv.evidence.values()].filter((e) => e.kind === 'row').length, 0)

  return (
    <Section
      id="zetaris"
      title="Zetaris unified semantic layer"
      icon="database"
      lede={
        <>
          Sources are onboarded into Zetaris and compiled into one semantic layer (USL). The agent queries the USL
          to find dependency paths no single source holds. Across all runs: <strong>{queries.length}</strong> queries,{' '}
          <strong>{rowsCited}</strong> rows retrieved as evidence.
        </>
      }
    >
      {!zetaris ? (
        <p className="pending">No zetaris.json yet. Sources, the compiled USL and data-quality results appear here.</p>
      ) : (
        <>
          <div className="subsection">
            <h3>1. Sources onboarded</h3>
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

          <div className="subsection">
            <h3>2. USL compiled</h3>
            <p>
              <code>{zetaris.usl.name}</code>{' '}
              <Badge
                tone={zetaris.usl.compile_status === 'success' ? 'ok' : 'fail'}
                icon={zetaris.usl.compile_status === 'success' ? 'check-circle' : 'x-circle'}
              >
                {zetaris.usl.compile_status === 'success' ? 'Compiled' : `Compile ${zetaris.usl.compile_status}`}
              </Badge>
              {zetaris.compiled_at && <span className="small muted"> · {zetaris.compiled_at}</span>}
            </p>
            <pre className="evidence-json">{zetaris.usl.compile_output}</pre>
            {zetaris.usl.relationships.length > 0 && (
              <ul className="bullets small">
                {zetaris.usl.relationships.map((r, i) => (
                  <li key={i}>
                    <code>{r.from}</code> → <code>{r.to}</code> via <code>{r.via}</code>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="subsection">
            <h3>3. USL queried during investigations</h3>
            <p className="small muted">
              Each run's report lists its queries and the exact rows used; open any row ID to see what was returned.
            </p>
          </div>

          <div className="subsection">
            <h3>4. Data-quality rules</h3>
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
                        <span className="th-sub">
                          <code>{r.expression}</code>
                        </span>
                      </th>
                      <td>
                        <Badge tone={r.status === 'pass' ? 'ok' : 'fail'} icon={r.status === 'pass' ? 'check-circle' : 'x-circle'}>
                          {r.status === 'pass' ? 'Pass' : 'Fail'}
                        </Badge>
                        {r.checked_rows != null && <span className="th-sub">{r.checked_rows} rows checked</span>}
                      </td>
                      <td>
                        {r.invalid_rows.length === 0 ? (
                          '—'
                        ) : (
                          <ul className="plain-list small">
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
            <p className="small muted fine-print">Rejected rows are shown, not silently dropped.</p>
          </div>
        </>
      )}
    </Section>
  )
}

function MemorySection({ runs }: { runs: LoadedRun[] }) {
  const ops = runs.flatMap((run) => run.inv.memory.map((m) => ({ run, m })))
  const engines = [...new Set(ops.map(({ m }) => m.engine))]
  const count = (action: string) => ops.filter(({ m }) => m.action === action).length

  return (
    <Section
      id="meterless"
      title="Meterless Engine: World Model"
      icon="info"
      lede={
        <>
          The investigation's state lives in the Meterless World Model: the components and links found, each
          hypothesis and its status, and what earlier investigations recorded. Writes record findings, reads are the
          agent consulting it (including recall across runs), updates revise a fact while keeping the old one.{' '}
          {engines.length > 0 && (
            <>
              Engine: <code>{engines.join(', ')}</code>.{' '}
            </>
          )}
          Across all runs: {plural(count('write'), 'write')}, {plural(count('read'), 'read')},{' '}
          {plural(count('update'), 'update')}.
        </>
      }
    >
      {ops.length === 0 ? (
        <p className="pending">No memory events recorded yet.</p>
      ) : (
        <ol className="memory-list">
          {runs
            .filter((run) => run.inv.memory.length > 0)
            .map((run) => (
              <li key={run.runId} className="card">
                <p>
                  <a href={href.case(run.caseEntry.id, { runId: run.runParam })}>
                    {run.caseEntry.label} · {run.runId}
                  </a>
                </p>
                <ul className="plain-list">
                  {run.inv.memory.map((m) => (
                    <li key={m.stepId}>
                      <Badge tone={m.action === 'read' ? 'neutral' : m.action === 'write' ? 'accent' : 'warn'}>
                        {m.action === 'read' ? 'Read' : m.action === 'write' ? 'Write' : 'Update'}
                      </Badge>{' '}
                      <a href={evidenceHref(run, m.stepId)}>{m.detail}</a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
        </ol>
      )}
    </Section>
  )
}

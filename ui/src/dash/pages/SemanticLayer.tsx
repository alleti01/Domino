// Semantic layer: what Zetaris joined for Domino. The answer first, then each
// source as one line with how much evidence came from it, then the kinds of
// links the layer found, then the platform export when it exists.

import { useState } from 'react'
import type { LinkStatus, SiteData } from '../../types'
import { allRuns, isExample } from '../derive'
import { DIcon } from '../icons'
import { ExampleTag, PageHeader, Panel, Status } from '../ui'
import { relationWords, sourceWords } from '../words'

const TOP = 6

export function SemanticLayer({ site }: { site: SiteData }) {
  const [allRels, setAllRels] = useState(false)
  const rows = allRuns(site).filter((r) => r.inv)
  const z = site.zetaris

  // Evidence rows cited, per source.
  const bySource = new Map<string, { rows: Set<string>; runs: Set<string> }>()
  for (const { run, inv } of rows) {
    for (const ev of inv!.evidence.values()) {
      if (ev.kind !== 'row' || !ev.source) continue
      const b = bySource.get(ev.source) ?? { rows: new Set(), runs: new Set() }
      b.rows.add(ev.id)
      b.runs.add(run.runId)
      bySource.set(ev.source, b)
    }
  }
  const sources = [...bySource].map(([src, b]) => ({ src, rows: b.rows.size, runs: b.runs.size })).sort((a, b) => b.rows - a.rows)
  const maxRows = Math.max(1, ...sources.map((s) => s.rows))
  const totalRows = sources.reduce((n, s) => n + s.rows, 0)

  // Links found, per relationship type, split by how well they're supported.
  const byRel = new Map<string, Record<LinkStatus, number>>()
  let queries = 0
  for (const { inv } of rows) {
    queries += inv!.queries
    for (const e of inv!.chain.edges) {
      const c = byRel.get(e.relation) ?? { observed: 0, inferred: 0, unresolved: 0 }
      c[e.status] += 1
      byRel.set(e.relation, c)
    }
  }
  const rels = [...byRel].map(([rel, c]) => ({ rel, ...c, total: c.observed + c.inferred + c.unresolved })).sort((a, b) => b.total - a.total)
  const maxRel = Math.max(1, ...rels.map((r) => r.total))
  const observed = rels.reduce((n, r) => n + r.observed, 0)
  const inferred = rels.reduce((n, r) => n + r.inferred, 0)
  const links = rels.reduce((n, r) => n + r.total, 0)

  return (
    <>
      <PageHeader
        title="Semantic layer"
        sub="Zetaris joins the separate systems around a change (code changes, database grants, service configuration and runtime limits) into one Unified Semantic Layer. The agent reads it with a read-only login, and every row it relies on is cited as evidence."
        meta={site.cases.some((c) => isExample(c.kind)) ? <ExampleTag /> : undefined}
      />

      <div className="dx-stack">
        <section className="dx-answer">
          <div className="dx-answer-main">
            <div className="dx-answer-head">
              <span className="dx-answer-icon tone-accent">
                <DIcon name="data" size={22} />
              </span>
              <div>
                <h2 className="dx-answer-headline">
                  {sources.length} sources joined into one view of each change
                </h2>
                <p className="dx-muted">
                  {queries.toLocaleString('en-US')} read-only queries across {rows.length} runs found {links.toLocaleString('en-US')} links between components.{' '}
                  {links > 0 && `${Math.round((observed / links) * 100)}% are confirmed by two sources.`}
                </p>
              </div>
            </div>
            <dl className="dx-facts">
              <div>
                <dt>Queries</dt>
                <dd>{queries.toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt>Source rows cited</dt>
                <dd>{totalRows.toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt>Links observed</dt>
                <dd>
                  <Status tone="ok">{observed}</Status>
                </dd>
              </div>
              <div>
                <dt>Links inferred</dt>
                <dd>
                  <Status tone="warn">{inferred}</Status>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <Panel title="Sources" count={sources.length} flush>
          {sources.length === 0 ? (
            <p className="dx-faint" style={{ padding: 16 }}>
              No source rows cited in the loaded runs.
            </p>
          ) : (
            <ol className="dx-xruns">
              {sources.map((s) => (
                <li key={s.src} className="dx-mc-row">
                  <span className="dx-mc-name" title={s.src}>
                    <span style={{ fontWeight: 500 }}>{sourceWords(s.src)}</span>
                  </span>
                  <span className="dx-mc-share">
                    <span className="dx-mc-track">
                      <span className="dx-mc-bar is-other" style={{ width: `${(s.rows / maxRows) * 100}%` }} />
                    </span>
                    <span className="dx-num dx-mc-n">{s.rows}</span>
                    <span className="dx-faint dx-mc-unit">rows</span>
                  </span>
                  <span className="dx-faint dx-num dx-mc-lat">cited in {s.runs} runs</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        {rels.length > 0 && (
          <Panel
            title="What the layer connects"
            count={rels.length}
            flush
            actions={
              rels.length > TOP ? (
                <button type="button" className="dx-btn dx-btn-sm dx-btn-ghost" onClick={() => setAllRels((v) => !v)}>
                  {allRels ? 'Show fewer' : `Show all ${rels.length}`}
                </button>
              ) : null
            }
          >
            <ol className="dx-xruns">
              {(allRels ? rels : rels.slice(0, TOP)).map((r) => (
                <li key={r.rel} className="dx-mc-row">
                  <span className="dx-mc-name" title={r.rel}>
                    <span style={{ fontWeight: 500 }}>
                      <span className="dx-faint">A </span>
                      {relationWords(r.rel)}
                      <span className="dx-faint"> B</span>
                    </span>
                  </span>
                  <span className="dx-mc-share">
                    <span className="dx-mc-track" title={`${r.observed} observed · ${r.inferred} inferred${r.unresolved ? ` · ${r.unresolved} unresolved` : ''}`}>
                      <span className="dx-sl-split" style={{ width: `${(r.total / maxRel) * 100}%` }}>
                        <span className="is-observed" style={{ flex: r.observed }} />
                        <span className="is-inferred" style={{ flex: r.inferred }} />
                        <span className="is-unresolved" style={{ flex: r.unresolved }} />
                      </span>
                    </span>
                    <span className="dx-num dx-mc-n">{r.total}</span>
                    <span className="dx-faint dx-mc-unit">links</span>
                  </span>
                  <span className="dx-faint dx-num dx-mc-lat">
                    {r.observed === r.total ? 'all observed' : r.observed === 0 ? 'all inferred' : `${r.observed} of ${r.total} observed`}
                  </span>
                </li>
              ))}
            </ol>
            <div className="dx-rgrid-legend">
              <span>
                <i className="dx-sl-key is-observed" /> Observed: two sources agree
              </span>
              <span>
                <i className="dx-sl-key is-inferred" /> Inferred: not confirmed by a second source
              </span>
            </div>
          </Panel>
        )}

        <Panel title="Platform export" flush>
          {!z ? (
            <p className="dx-faint" style={{ padding: '14px 16px' }}>
              Onboarded sources, the compiled USL and data-quality rules appear here once the project’s Zetaris export is available.
            </p>
          ) : (
            <ul className="dx-bench">
              <li>
                <span className="dx-bench-name">
                  USL {z.usl.name}{' '}
                  <Status tone={z.usl.compile_status === 'success' ? 'ok' : 'fail'}>compile {z.usl.compile_status}</Status>
                </span>
                <span className="dx-faint">
                  {z.usl.entities.length} entities · {z.usl.relationships.length} relationships · {z.sources.length} onboarded sources
                </span>
              </li>
              {z.dq_rules.length > 0 && (
                <li>
                  <span className="dx-bench-name">Data-quality rules</span>
                  <ul className="dx-xchecks">
                    {z.dq_rules.map((r) => (
                      <li key={r.rule_id} title={r.expression}>
                        <Status tone={r.status === 'pass' ? 'ok' : 'fail'}>{r.name}</Status>
                        <span className="dx-faint">
                          {r.checked_rows ?? '—'} rows checked{r.invalid_rows.length ? ` · ${r.invalid_rows.length} rejected` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              )}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}

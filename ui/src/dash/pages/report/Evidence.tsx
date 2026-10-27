// Evidence: where the facts came from, the map they form, each link one line,
// each hypothesis one line, and the change itself. Raw IDs and code wait behind
// a click; every line opens to the source rows behind it.

import { useMemo, useState } from 'react'
import { investigationMap, pathOnly, type InvestigationMap, type MapEdge, type MapSelection } from '../../../lib/graph'
import { HYPOTHESIS, LINK_STATUS } from '../../../lib/labels'
import type { Investigation, LinkStatus, SourceRef } from '../../../types'
import { componentRoles, roleFor } from '../../derive'
import { DIcon } from '../../icons'
import { Empty, EvidenceChip, humanize, More, Panel, Seg, Status, Tag } from '../../ui'
import { kindWord, relationWords, sourceWords } from '../../words'
import { Graph } from './PathTab'

/** A short line drawn the way the map draws the link. */
function LinkGlyph({ status }: { status: LinkStatus }) {
  return (
    <svg className={`dx-glyph is-${status}`} width="20" height="8" viewBox="0 0 20 8" aria-label={LINK_STATUS[status].label}>
      <line x1="1" y1="4" x2="19" y2="4" strokeDasharray={status === 'inferred' ? '4 3' : status === 'unresolved' ? '1.5 3' : undefined} />
    </svg>
  )
}

/** Source rows grouped by source, in plain names: "Database catalog · tl-0011, ag-0010". */
function Sources({ refs }: { refs: SourceRef[] }) {
  const by = new Map<string, string[]>()
  for (const r of refs) by.set(r.source, [...(by.get(r.source) ?? []), ...r.ids])
  if (by.size === 0) return <span className="dx-faint">No rows cited</span>
  return (
    <div className="dx-srcs">
      {[...by].map(([src, ids]) => (
        <div key={src}>
          <span className="dx-srcs-name">{sourceWords(src)}</span>
          <span className="dx-chips">
            {[...new Set(ids)].map((id) => (
              <EvidenceChip key={id} id={id} />
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

const rowCount = (refs: SourceRef[]) => new Set(refs.flatMap((r) => r.ids)).size

function Selection({ map, sel, inv }: { map: InvestigationMap; sel: MapSelection | null; inv: Investigation }) {
  const name = (id: string) => map.nodes.find((n) => n.id === id)?.label ?? id
  if (!sel) {
    return (
      <div className="dx-sel dx-sel-empty">
        <p className="dx-muted">Select a step or a link to see the rows behind it.</p>
        <ul className="dx-legend-list">
          <li>
            <LinkGlyph status="observed" /> Observed: two sources agree
          </li>
          <li>
            <LinkGlyph status="inferred" /> Inferred: not confirmed by a second source
          </li>
          <li>
            <LinkGlyph status="unresolved" /> Unresolved
          </li>
        </ul>
      </div>
    )
  }
  if (sel.type === 'node') {
    const n = map.nodes.find((x) => x.id === sel.id)
    if (!n) return null
    const role = roleFor(n.label, componentRoles(inv))
    const links = map.edges.filter((e) => e.from === n.id || e.to === n.id)
    return (
      <div className="dx-sel">
        <span className="dx-sum-label">{n.isChange ? 'The change' : kindWord(n.kind)}</span>
        <h3>{n.label}</h3>
        {role && <p className="dx-muted">{role}</p>}
        {n.step != null && !n.isChange && <p className="dx-faint">Step {n.step} on the verdict’s path</p>}
        {links.length > 0 && (
          <ul className="dx-sel-links">
            {links.map((e) => (
              <li key={e.id}>
                <LinkGlyph status={e.status} />
                {e.from === n.id ? (
                  <span>
                    {relationWords(e.relation)} <b>{name(e.to)}</b>
                  </span>
                ) : (
                  <span>
                    <b>{name(e.from)}</b> {relationWords(e.relation)} this
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <Sources refs={n.refs} />
      </div>
    )
  }
  const e = map.edges.find((x) => x.id === sel.id)
  if (!e) return null
  return (
    <div className="dx-sel">
      <span className="dx-sum-label">Link</span>
      <h3>
        {name(e.from)} <span className="dx-muted" style={{ fontWeight: 400 }}>{relationWords(e.relation)}</span> {name(e.to)}
      </h3>
      <p className="dx-row" style={{ gap: 8 }}>
        <LinkGlyph status={e.status} /> {LINK_STATUS[e.status].label}
      </p>
      {e.detail && <code className="dx-sel-detail">{e.detail}</code>}
      <Sources refs={e.refs} />
    </div>
  )
}

function LinkRow({ e, name }: { e: MapEdge; name: (id: string) => string }) {
  const rows = rowCount(e.refs)
  return (
    <li>
      <details className="dx-xrun">
        <summary>
          <DIcon name="chevron-right" size={14} className="dx-chev" />
          <LinkGlyph status={e.status} />
          <span className="dx-link-line">
            <b>{name(e.from)}</b> <span className="dx-muted">{relationWords(e.relation)}</span> <b>{name(e.to)}</b>
          </span>
          <span className="dx-sp" />
          <span className="dx-faint">
            {rows ? `${rows} row${rows === 1 ? '' : 's'}` : 'no rows'}
          </span>
        </summary>
        <div className="dx-xrun-b">
          <p className="dx-muted">
            {LINK_STATUS[e.status].label}
            {e.status === 'observed' ? ': two sources agree.' : e.status === 'inferred' ? ': not confirmed by a second source.' : '.'}
          </p>
          {e.detail && <code className="dx-sel-detail">{e.detail}</code>}
          <Sources refs={e.refs} />
        </div>
      </details>
    </li>
  )
}

function diffLines(diff: string) {
  let add = 0
  let del = 0
  for (const l of diff.split('\n')) {
    if (l.startsWith('+') && !l.startsWith('+++')) add += 1
    else if (l.startsWith('-') && !l.startsWith('---')) del += 1
  }
  return { add, del }
}

export function EvidenceTab({ inv }: { inv: Investigation }) {
  const full = useMemo(() => investigationMap(inv), [inv])
  const [scope, setScope] = useState<'path' | 'all'>(full.path.length > 1 ? 'path' : 'all')
  const [sel, setSel] = useState<MapSelection | null>(null)
  const map = scope === 'path' && full.path.length > 1 ? pathOnly(full) : full
  const name = (id: string) => full.nodes.find((n) => n.id === id)?.label ?? id

  const sources = [...new Set([...full.edges.flatMap((e) => e.refs), ...full.nodes.flatMap((n) => n.refs)].map((r) => r.source))].filter(Boolean)
  const rows = new Set([...inv.evidence.values()].filter((e) => e.kind === 'row').map((e) => e.id)).size
  const count = (s: LinkStatus) => full.edges.filter((e) => e.status === s).length
  const c = inv.change
  const diff = c?.diff ? diffLines(c.diff) : null

  return (
    <div className="dx-stack">
      {/* Where the facts came from */}
      <section className="dx-panel">
        <div className="dx-arms">
          <div className="dx-arm-card">
            <span className="dx-arm-name">Sources joined</span>
            <span className="dx-arm-result">{sources.length}</span>
            <span className="dx-faint dx-arm-sub">{sources.map(sourceWords).join(', ') || '—'}</span>
          </div>
          <div className="dx-arm-card">
            <span className="dx-arm-name">Links found</span>
            <span className="dx-arm-result">{full.edges.length}</span>
            <span className="dx-faint dx-arm-sub">
              {count('observed')} observed · {count('inferred')} inferred
              {count('unresolved') ? ` · ${count('unresolved')} unresolved` : ''}
            </span>
          </div>
          <div className="dx-arm-card">
            <span className="dx-arm-name">Source rows cited</span>
            <span className="dx-arm-result">{rows}</span>
            <span className="dx-faint dx-arm-sub">from {inv.queries} semantic-layer queries</span>
          </div>
        </div>
      </section>

      {full.nodes.length === 0 ? (
        <Panel>
          <Empty icon="graph" title="No semantic-layer graph in this run">
            This run didn’t retrieve a dependency path{inv.runMode !== 'full' ? ' (its mode skips the semantic layer)' : ''}.
          </Empty>
        </Panel>
      ) : (
        <>
          <Panel
            title="Dependency map"
            flush
            actions={
              full.path.length > 1 ? (
                <Seg<'path' | 'all'>
                  label="Scope"
                  value={scope}
                  onChange={(v) => {
                    setScope(v)
                    setSel(null)
                  }}
                  options={[
                    { value: 'path', label: 'Verdict path' },
                    { value: 'all', label: `Everything found (${full.nodes.length})` },
                  ]}
                />
              ) : null
            }
          >
            <div className="dx-map-body">
              <Graph map={map} sel={sel} onSelect={setSel} />
              <Selection map={map} sel={sel} inv={inv} />
            </div>
          </Panel>

          <Panel title="Links" count={map.edges.length} flush>
            <ol className="dx-xruns">
              {map.edges.map((e) => (
                <LinkRow key={e.id} e={e} name={name} />
              ))}
            </ol>
          </Panel>
        </>
      )}

      {inv.hypotheses.length > 0 && (
        <Panel title="Hypotheses" count={inv.hypotheses.length} flush>
          <ol className="dx-xruns">
            {inv.hypotheses.map((h) => {
              const st = HYPOTHESIS[h.status]
              return (
                <li key={h.id}>
                  <details className="dx-xrun">
                    <summary>
                      <DIcon name="chevron-right" size={14} className="dx-chev" />
                      <span className="dx-hyp-claim">{h.claim}</span>
                      <span className="dx-sp" />
                      <Status tone={st.tone}>{st.label}</Status>
                    </summary>
                    <div className="dx-xrun-b dx-hyp-b">
                      {h.mechanism && (
                        <div>
                          <span className="dx-sum-label">How it would happen</span>
                          <p>{h.mechanism}</p>
                        </div>
                      )}
                      {h.falsifiedBy && (
                        <div>
                          <span className="dx-sum-label">What would prove it wrong</span>
                          <p>{h.falsifiedBy}</p>
                        </div>
                      )}
                      {(h.evidenceFor.length > 0 || h.evidenceAgainst.length > 0) && (
                        <div>
                          <span className="dx-sum-label">Evidence</span>
                          {h.evidenceFor.length > 0 && <Sources refs={h.evidenceFor} />}
                          {h.evidenceAgainst.length > 0 && (
                            <>
                              <span className="dx-faint">Against</span>
                              <Sources refs={h.evidenceAgainst} />
                            </>
                          )}
                        </div>
                      )}
                      <p className="dx-faint">
                        {h.experimentIds.length > 0 && <>Tested by {h.experimentIds.length} sandbox run{h.experimentIds.length === 1 ? '' : 's'}. </>}
                        {h.confidence != null && <>Model’s own confidence {Math.round(h.confidence * 100)}% (advisory). </>}
                        {h.history.length > 0 && <>Revised: {[...h.history, h.status].map((s) => HYPOTHESIS[s].label).join(' → ')}.</>}
                      </p>
                    </div>
                  </details>
                </li>
              )
            })}
          </ol>
        </Panel>
      )}

      {c && (
        <Panel title="The change" desc={<span className="dx-id">{c.changeId}</span>}>
          <div style={{ display: 'grid', gap: 12 }}>
            {c.description && <p className="dx-prose">{c.description.split(/System components:/i)[0].trim()}</p>}
            <p className="dx-row dx-wrap" style={{ gap: 8 }}>
              {c.files.map((f) => (
                <Tag key={f} mono>
                  {f}
                </Tag>
              ))}
              {diff && (
                <span className="dx-faint">
                  <span className="dx-add">+{diff.add}</span> <span className="dx-del">−{diff.del}</span>
                </span>
              )}
            </p>
            <div className="dx-more-group is-first">
              {c.diff && (
                <More summary="Show the diff">
                  <pre className="dx-pre dx-diff">
                    {c.diff.split('\n').map((l, i) => (
                      <div
                        key={i}
                        className={l.startsWith('@@') ? 'hunk' : l.startsWith('+') && !l.startsWith('+++') ? 'add' : l.startsWith('-') && !l.startsWith('---') ? 'del' : undefined}
                      >
                        {l || ' '}
                      </div>
                    ))}
                  </pre>
                </More>
              )}
              {c.entities.length > 0 && (
                <More summary={`What it touches (${c.entities.length})`}>
                  <ul className="dx-xchecks">
                    {c.entities.map((e) => (
                      <li key={e.id}>
                        <span className="dx-faint" style={{ minWidth: 64 }}>
                          {humanize(e.kind).name}
                        </span>
                        <b style={{ fontWeight: 500 }}>{e.id}</b>
                        {e.sourceLine && <code className="dx-faint">{e.sourceLine}</code>}
                      </li>
                    ))}
                  </ul>
                </More>
              )}
            </div>
          </div>
        </Panel>
      )}

      {inv.chain.dqIssues.length > 0 && (
        <Panel title="Data-quality findings" count={inv.chain.dqIssues.length} flush>
          <ol className="dx-xruns">
            {inv.chain.dqIssues.map((d, i) => (
              <li key={i} className="dx-dq">
                <DIcon name="alert" size={14} />
                <span>{d.detail}</span>
                <span className="dx-sp" />
                <span className="dx-id">{d.rowId}</span>
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </div>
  )
}

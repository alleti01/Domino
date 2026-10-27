import type { Investigation } from '../../types'
import { LINK_STATUS } from '../../lib/labels'
import { EvidenceLink, Refs } from '../common'
import { Icon } from '../Icon'
import { DependencyMap } from './DependencyMap'

export function DiffBlock({ diff }: { diff: string }) {
  const lines = diff.replace(/\n$/, '').split('\n')
  return (
    <pre className="diff" aria-label="Diff">
      {lines.map((line, i) => {
        const kind =
          line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')
            ? 'meta'
            : line[0] === '+'
              ? 'add'
              : line[0] === '-'
                ? 'del'
                : ''
        return (
          <span key={i} className={kind ? `diff-${kind}` : undefined}>
            {kind === 'add' && <span className="visually-hidden">Added: </span>}
            {kind === 'del' && <span className="visually-hidden">Removed: </span>}
            {line}
            {'\n'}
          </span>
        )
      })}
    </pre>
  )
}

/** The change itself, then how it connects to the systems around it. */
export function ContextView({ inv }: { inv: Investigation }) {
  const change = inv.change
  const sources = new Set(inv.chain.nodes.flatMap((n) => n.refs.map((r) => r.source)))

  return (
    <div className="stack">
      <section className="bench" id="change" aria-labelledby="change-title">
        <div className="cell">
        <p className="kicker">Proposed change</p>
        <h2 id="change-title" className="cell-title">
          The change
        </h2>
        {!change ? (
          <p className="muted">The trace doesn't include the change yet.</p>
        ) : (
          <div className="change-grid">
            <div>
              {change.description && <p className="change-desc">{change.description}</p>}
              {change.summary && <p className="muted">{change.summary}</p>}
            </div>
            <dl className="facts">
              <div>
                <dt>Change</dt>
                <dd>
                  <EvidenceLink id={change.stepId}>
                    <code>{change.changeId}</code>
                  </EvidenceLink>
                </dd>
              </div>
              <div>
                <dt>Files</dt>
                <dd>
                  {change.files.length ? change.files.map((f) => <code key={f} className="wrap-id">{f}</code>) : <span className="muted">None listed</span>}
                </dd>
              </div>
              {change.entities.length > 0 && (
                <div>
                  <dt>Touches</dt>
                  <dd className="entity-list">
                    {change.entities.map((e) => (
                      <span key={`${e.kind}-${e.id}`} className="entity">
                        <span className="entity-kind">{e.kind}</span>
                        <code className="wrap-id">{e.id}</code>
                        {e.sourceLine && <span className="entity-line wrap-id">{e.sourceLine}</span>}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
            {change.diff && (
              <details className="diff-details">
                <summary>Show the diff</summary>
                <DiffBlock diff={change.diff} />
              </details>
            )}
          </div>
        )}
        </div>
      </section>

      <section className="bench" id="chain" aria-label="Dependency map">
        <DependencyMap inv={inv} />
        <div className="cell cell-foot">
          <p className="readout-sub">
            Joined across {sources.size} {sources.size === 1 ? 'source' : 'separate sources'} in the Zetaris semantic layer.
          </p>
        {inv.chain.edges.length > 0 && (
          <details className="graph-details">
            <summary>
              Everything the semantic layer connected around the change: {inv.chain.nodes.length} components, {inv.chain.edges.length} links
            </summary>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="All links found">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">From</th>
                    <th scope="col">Relationship</th>
                    <th scope="col">To</th>
                    <th scope="col">Status</th>
                    <th scope="col">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.chain.edges.map((e, i) => (
                    <tr key={i}>
                      <td>
                        <code className="wrap-id">{e.from}</code>
                      </td>
                      <td>
                        {e.relation.replace(/_/g, ' ')}
                        {e.detail && <span className="cell-sub">{e.detail}</span>}
                      </td>
                      <td>
                        <code className="wrap-id">{e.to}</code>
                      </td>
                      <td>
                        <span className={`link-status status-${e.status}`}>{LINK_STATUS[e.status].label}</span>
                      </td>
                      <td>
                        <Refs refs={e.refs} empty={<span className="muted">—</span>} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {inv.chain.dqIssues.length > 0 && (
          <div className="dq">
            <h3>
              <Icon name="alert" size={15} /> Rows rejected by data-quality rules
            </h3>
            <ul className="plain-bullets">
              {inv.chain.dqIssues.map((d, i) => (
                <li key={i}>
                  {d.rule}: <EvidenceLink id={d.rowId}>{d.rowId}</EvidenceLink> <span className="muted">{d.detail}</span>
                </li>
              ))}
            </ul>
            <p className="side-note">Shown, not hidden: these rows were rejected rather than used as evidence.</p>
          </div>
        )}
        </div>
      </section>
    </div>
  )
}

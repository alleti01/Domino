import type { DependencyChain, GraphNode } from '../../types'
import { LINK_STATUS } from '../../lib/labels'
import { Badge, EvidenceLink, Pending, Refs, Section } from '../common'

function NodeCard({ node, fallback }: { node: GraphNode | undefined; fallback: string }) {
  return (
    <div className="chain-node">
      <span className="chain-kind">{node?.kind ?? 'component'}</span>
      <span className="chain-label">{node?.label ?? fallback}</span>
      {node && <Refs refs={node.refs} />}
    </div>
  )
}

export function DependencyChainSection({ chain, hasVerdict }: { chain: DependencyChain; hasVerdict: boolean }) {
  const nodes = new Map(chain.nodes.map((n) => [n.id, n]))
  const sources = new Set(chain.nodes.flatMap((n) => n.refs.map((r) => r.source)))
  const first = chain.causal.find((l) => l.edge)?.edge

  return (
    <Section
      id="chain"
      title="Dependency chain"
      icon="database"
      lede={
        <>
          How the change reaches what broke, joined across {sources.size} independent{' '}
          {sources.size === 1 ? 'source' : 'sources'} in the Zetaris semantic layer. No single source holds the whole
          path.
        </>
      }
    >
      <div className="chain-legend" aria-label="Legend">
        <span className="legend-item">
          <span className="legend-line observed" aria-hidden="true" /> Observed: backed by retrieved rows
        </span>
        <span className="legend-item">
          <span className="legend-line inferred" aria-hidden="true" /> Inferred: proposed, not directly in the data
        </span>
      </div>

      <div className="subsection">
        <h3>Causal chain behind the verdict</h3>
        {chain.causal.length === 0 ? (
          <Pending>
            {hasVerdict
              ? 'No causal chain: the verdict did not trace a path from the change to a failure.'
              : 'The causal chain is traced when the verdict is decided.'}
          </Pending>
        ) : (
          <ol className="chain">
            {first && (
              <li className="chain-step">
                <NodeCard node={nodes.get(first.from)} fallback={first.from} />
              </li>
            )}
            {chain.causal.map((link, i) => {
              const status = LINK_STATUS[link.status]
              return (
                <li key={i} className="chain-step">
                  <div className={`chain-edge ${link.status}`}>
                    <span className="chain-edge-line" aria-hidden="true" />
                    <div className="chain-edge-body">
                      <span className="chain-relation">{link.edge ? link.edge.relation.replace(/_/g, ' ') : link.text}</span>
                      {link.detail && <code className="chain-detail">{link.detail}</code>}
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <Refs refs={link.refs} empty={<span className="small muted">No rows cited</span>} />
                    </div>
                  </div>
                  {link.edge && <NodeCard node={nodes.get(link.edge.to)} fallback={link.edge.to} />}
                </li>
              )
            })}
          </ol>
        )}
      </div>

      {chain.edges.length > 0 ? (
        <details className="subsection">
          <summary>
            Everything the semantic layer connected around the change ({chain.nodes.length} components,{' '}
            {chain.edges.length} links)
          </summary>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="All links found">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Link</th>
                  <th scope="col">Status</th>
                  <th scope="col">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {chain.edges.map((e, i) => {
                  const status = LINK_STATUS[e.status]
                  return (
                    <tr key={i}>
                      <td>
                        <code>{e.from}</code> <span className="muted">{e.relation.replace(/_/g, ' ')}</span>{' '}
                        <code>{e.to}</code>
                        {e.detail && <span className="th-sub">{e.detail}</span>}
                      </td>
                      <td>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>
                        <Refs refs={e.refs} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </details>
      ) : (
        !hasVerdict && <Pending>The semantic layer hasn't been queried for this change yet.</Pending>
      )}

      {chain.dqIssues.length > 0 && (
        <div className="subsection">
          <h3>Data-quality issues (Zetaris RUN DQ)</h3>
          <ul className="plain-list">
            {chain.dqIssues.map((d, i) => (
              <li key={i}>
                <Badge tone="fail" icon="x-circle">
                  {d.rule}
                </Badge>{' '}
                <EvidenceLink id={d.rowId}>
                  <code>{d.rowId}</code>
                </EvidenceLink>
                <span className="muted">: {d.detail}</span>
              </li>
            ))}
          </ul>
          <p className="small muted">Shown, not hidden: these rows were rejected rather than used as evidence.</p>
        </div>
      )}
    </Section>
  )
}

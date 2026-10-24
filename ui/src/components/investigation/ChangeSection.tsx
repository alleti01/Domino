import type { ChangeSummary } from '../../types'
import { EvidenceLink, Pending, Section } from '../common'

function DiffBlock({ diff }: { diff: string }) {
  const lines = diff.replace(/\n$/, '').split('\n')
  return (
    <pre className="diff" aria-label="Diff">
      {lines.map((line, i) => {
        const kind = line.startsWith('+++') || line.startsWith('---') ? 'meta' : line[0] === '+' ? 'add' : line[0] === '-' ? 'del' : line.startsWith('@@') ? 'meta' : ''
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

export function ChangeSection({ change }: { change: ChangeSummary | null }) {
  return (
    <Section id="change" title="The change" icon="file-code" lede="What the pull request changes, tied to the lines it touches.">
      {!change ? (
        <Pending>The change hasn't been read yet.</Pending>
      ) : (
        <>
          {change.description && <p>{change.description}</p>}
          <dl className="meta-row">
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
                {change.files.map((f, i) => (
                  <span key={f}>
                    {i > 0 && ', '}
                    <code>{f}</code>
                  </span>
                ))}
              </dd>
            </div>
          </dl>
          {change.summary && <p className="muted">{change.summary}</p>}
          {change.entities.length > 0 && (
            <ul className="statement-list" aria-label="What the change touches">
              {change.entities.map((e) => (
                <li key={`${e.kind}-${e.id}`}>
                  <p>
                    <span className="chain-kind">{e.kind}</span> <strong>{e.id}</strong>
                  </p>
                  {e.sourceLine && <code className="code-ref">{e.sourceLine}</code>}
                </li>
              ))}
            </ul>
          )}
          {change.diff && (
            <details>
              <summary>Show the diff</summary>
              <DiffBlock diff={change.diff} />
            </details>
          )}
        </>
      )}
    </Section>
  )
}

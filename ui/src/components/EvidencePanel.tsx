import { useEffect, useRef } from 'react'
import type { EvidenceKind, Investigation } from '../types'
import { restoreOpenerFocus, trapTab } from '../lib/focus'
import { navigate, useLocation, withEvidence } from '../lib/router'
import { Icon } from './Icon'

// Below this width the panel covers the page, so it behaves like a dialog.
const OVERLAY_QUERY = '(max-width: 1200px)'

// Long or multi-line strings read better as preformatted blocks.
const BLOCK_FIELDS = new Set(['logs_tail', 'diff', 'sql', 'detail', 'summary', 'mechanism', 'description'])

const KIND_LABEL: Record<EvidenceKind, string> = {
  row: 'Data row from the semantic layer',
  experiment: 'Experiment result',
  hypothesis: 'Hypothesis',
  step: 'Trace step',
}

function FieldValue({ name, value }: { name: string; value: unknown }) {
  if (value == null) return <span className="muted">—</span>
  if (typeof value === 'string') {
    return BLOCK_FIELDS.has(name) || value.length > 80 || value.includes('\n') ? (
      <pre className="evidence-json">{value}</pre>
    ) : (
      <span>{value}</span>
    )
  }
  if (typeof value === 'number' || typeof value === 'boolean') return <code>{String(value)}</code>
  return <pre className="evidence-json">{JSON.stringify(value, null, 2)}</pre>
}

export function EvidencePanel({ id, inv }: { id: string; inv: Investigation | null }) {
  const loc = useLocation()
  const ref = useRef<HTMLElement>(null)
  const item = inv?.evidence.get(id) ?? null
  const closeHref = withEvidence(loc, null)

  // Focus the panel whenever it shows new evidence…
  useEffect(() => {
    ref.current?.focus()
  }, [id])

  // …and hand focus back to the link that opened it when it closes.
  useEffect(() => () => restoreOpenerFocus(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate(closeHref, { replace: true })
        return
      }
      if (ref.current && window.matchMedia(OVERLAY_QUERY).matches) trapTab(e, ref.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeHref])

  const fields = item ? Object.entries(item.fields) : []

  return (
    <aside className="evidence-panel" aria-labelledby="evidence-title" tabIndex={-1} ref={ref}>
      <header className="evidence-head">
        <p className="verdict-kicker">Evidence</p>
        <a className="evidence-close" href={closeHref} aria-label="Close evidence panel (Esc)">
          <Icon name="x-circle" size={18} />
        </a>
      </header>
      {!item ? (
        <>
          <h2 id="evidence-title">Not found</h2>
          <p className="muted">
            <code>{id}</code> isn't in {inv ? 'this run' : 'the current page'}. Evidence IDs only make sense inside the
            run they came from.
          </p>
        </>
      ) : (
        <>
          <h2 id="evidence-title">{item.title}</h2>
          <dl className="evidence-meta">
            <div>
              <dt>ID</dt>
              <dd>
                <code>{item.id}</code>
                {inv && <span className="muted small"> · run {inv.runId}</span>}
              </dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{KIND_LABEL[item.kind]}</dd>
            </div>
            {item.source && (
              <div>
                <dt>Source</dt>
                <dd>{item.source}</dd>
              </div>
            )}
            {item.context.length > 0 && (
              <div>
                <dt>Seen in</dt>
                <dd>{item.context.join('; ')}</dd>
              </div>
            )}
          </dl>
          {item.facts.length > 0 && (
            <>
              <h3>{item.kind === 'row' ? 'What this row says' : 'Summary'}</h3>
              <ul className="bullets">
                {item.facts.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </>
          )}
          <h3>Recorded data</h3>
          {fields.length === 0 ? (
            <p className="muted small">No fields recorded.</p>
          ) : (
            <dl className="evidence-fields">
              {fields.map(([k, v]) => (
                <div key={k}>
                  <dt>
                    <code>{k}</code>
                  </dt>
                  <dd>
                    <FieldValue name={k} value={v} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="small muted fine-print">Shown exactly as saved in the run's trace file.</p>
        </>
      )}
    </aside>
  )
}

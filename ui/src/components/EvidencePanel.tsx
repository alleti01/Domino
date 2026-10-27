import { useEffect, useRef } from 'react'
import type { EvidenceKind, Investigation } from '../types'
import { useMedia } from '../hooks/useMedia'
import { restoreOpenerFocus, trapTab } from '../lib/focus'
import { navigate, useLocation, withEvidence } from '../lib/router'
import { Ident } from './common'
import { Icon } from './Icon'
import { DiffBlock } from './report/Context'

// Below this width the inspector covers the page, so it behaves like a dialog.
export const OVERLAY_QUERY = '(max-width: 1279px)'

const KIND_LABEL: Record<EvidenceKind, string> = {
  row: 'Data row · Zetaris semantic layer',
  experiment: 'Sandbox run',
  hypothesis: 'Hypothesis',
  step: 'Trace event',
}

const looksLikeSql = (s: string) => /^\s*(select|grant|revoke|insert|update|delete|create|alter|with|run dq|compile)\b/i.test(s)

/** A recorded value, formatted for what it is: SQL, a diff, a log, JSON, or a long identifier. */
function FieldValue({ name, value }: { name: string; value: unknown }) {
  if (value == null) return <span className="muted">—</span>
  if (typeof value === 'number' || typeof value === 'boolean') return <code>{String(value)}</code>
  if (typeof value === 'string') {
    if (name === 'diff' || /^(---|\+\+\+|@@) /m.test(value)) return <DiffBlock diff={value} />
    if (/log/i.test(name)) return <pre className="field-block is-log">{value}</pre>
    if (/sql|query|expression/i.test(name) || looksLikeSql(value)) return <pre className="field-block is-sql">{value}</pre>
    if (value.includes('\n') || value.length > 120) return <p className="field-text">{value}</p>
    return <code className="wrap-id">{value}</code>
  }
  if (Array.isArray(value) && value.every((v) => typeof v === 'string' && v.length < 80)) {
    return (
      <span className="field-list">
        {(value as string[]).map((v, i) => (
          <code key={i} className="wrap-id">
            {v}
          </code>
        ))}
      </span>
    )
  }
  return <pre className="field-block">{JSON.stringify(value, null, 2)}</pre>
}

/**
 * Evidence for the open run, addressed by ?evidence=. IDs are scoped to a run,
 * so it only ever looks them up in the investigation the page is showing.
 * Wide screens dock it beside the report; narrower ones show it as a dialog.
 */
export function EvidencePanel({ id, inv }: { id: string; inv: Investigation | null }) {
  const loc = useLocation()
  const ref = useRef<HTMLElement>(null)
  const item = inv?.evidence.get(id) ?? null
  const closeHref = withEvidence(loc, null)
  const overlay = useMedia(OVERLAY_QUERY)

  // Focus the inspector whenever it shows new evidence…
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
      if (ref.current && overlay) trapTab(e, ref.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeHref, overlay])

  const fields = item ? Object.entries(item.fields) : []

  return (
    <>
      <a className="inspector-backdrop" href={closeHref} tabIndex={-1} aria-hidden="true" />
      <aside
        className="inspector"
        aria-labelledby="evidence-title"
        tabIndex={-1}
        ref={ref}
        role={overlay ? 'dialog' : 'complementary'}
        aria-modal={overlay ? true : undefined}
      >
        <header className="inspector-head">
          <p className="inspector-kind">{item ? KIND_LABEL[item.kind] : 'Evidence'}</p>
          <a className="icon-button" href={closeHref} aria-label="Close evidence (Esc)">
            <Icon name="close" size={18} />
          </a>
        </header>

        {!item ? (
          <div className="inspector-body">
            <h2 id="evidence-title">Not in this run</h2>
            <p className="muted">
              <code className="wrap-id">{id}</code> isn't recorded in {inv ? `run ${inv.runId}` : 'the page you are on'}.
              Evidence IDs only make sense inside the run they came from, so it isn't looked up anywhere else.
            </p>
          </div>
        ) : (
          <div className="inspector-body">
            <h2 id="evidence-title">{item.title}</h2>
            <dl className="provenance">
              {item.source && (
                <div>
                  <dt>Source</dt>
                  <dd>{item.source}</dd>
                </div>
              )}
              <div>
                <dt>Run</dt>
                <dd>
                  {inv && (
                    <>
                      {inv.caseLabel} · <code className="wrap-id">{inv.runId}</code>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>ID</dt>
                <dd>
                  <code className="wrap-id">{item.id}</code>
                </dd>
              </div>
              {item.context.length > 0 && (
                <div>
                  <dt>Seen in</dt>
                  <dd>{item.context.join('; ')}</dd>
                </div>
              )}
            </dl>

            {item.facts.length > 0 && (
              <section className="inspector-section" aria-labelledby="ev-summary">
                <h3 id="ev-summary">{item.kind === 'row' ? 'What this row says' : 'Summary'}</h3>
                <ul className="plain-bullets">
                  {item.facts.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </section>
            )}

            {fields.length > 0 && (
              <section className="inspector-section" aria-labelledby="ev-fields">
                <h3 id="ev-fields">Recorded fields</h3>
                <dl className="fields">
                  {fields.map(([k, v]) => (
                    <div key={k}>
                      <dt>{k.includes('.') ? <Ident name={k} /> : k.replace(/_/g, ' ')}</dt>
                      <dd>
                        <FieldValue name={k} value={v} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {fields.length > 0 && (
              <details className="side-details">
                <summary>Raw recorded data</summary>
                <pre className="field-block">{JSON.stringify(item.fields, null, 2)}</pre>
              </details>
            )}
            <p className="side-note">Taken from the run's saved trace.</p>
          </div>
        )}
      </aside>
    </>
  )
}

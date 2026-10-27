import { useEffect, useRef } from 'react'
import { navigate, useLocation, withEvidence } from '../lib/router'
import type { EvidenceKind, Investigation } from '../types'
import { fmtValue } from './derive'
import { DIcon } from './icons'
import { Empty, Id, KV, Tag } from './ui'

const KIND: Record<EvidenceKind, string> = {
  row: 'Source row',
  experiment: 'Sandbox run',
  hypothesis: 'Hypothesis',
  step: 'Trace step',
}

/** Evidence opened from any ID chip. The URL holds it (?evidence=), so it can be linked and closed with Back or Esc. */
export function EvidenceDrawer({ id, inv }: { id: string; inv: Investigation | null }) {
  const loc = useLocation()
  const closeRef = useRef<HTMLButtonElement>(null)
  const opener = useRef<Element | null>(document.activeElement)
  const close = () => navigate(withEvidence(loc, null), { replace: true })

  useEffect(() => {
    closeRef.current?.focus()
    const back = opener.current
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (back instanceof HTMLElement) back.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const item = inv?.evidence.get(id) ?? null
  const fields = item ? Object.entries(item.fields).filter(([, v]) => v != null && v !== '') : []

  return (
    <>
      <div className="dx-scrim" onClick={close} />
      <aside className="dx-drawer" role="dialog" aria-modal="true" aria-labelledby="dx-drawer-title">
        <div className="dx-drawer-h">
          <div style={{ minWidth: 0, display: 'grid', gap: 6 }}>
            <div className="dx-row dx-wrap">
              {item && <Tag>{KIND[item.kind]}</Tag>}
              <Id copy>{id}</Id>
            </div>
            <h2 id="dx-drawer-title">{item ? item.title : 'Evidence not found'}</h2>
          </div>
          <button ref={closeRef} type="button" className="dx-btn dx-btn-ghost dx-btn-icon" style={{ marginLeft: 'auto' }} onClick={close} aria-label="Close evidence">
            <DIcon name="x" />
          </button>
        </div>
        <div className="dx-drawer-b">
          {!item ? (
            <Empty icon="alert" title="Not in this run">
              Evidence IDs are unique within one run. <code>{id}</code> isn’t part of the run on screen.
            </Empty>
          ) : (
            <>
              {item.source && (
                <section className="dx-drawer-section">
                  <h3>Source</h3>
                  <span className="dx-id">{item.source}</span>
                </section>
              )}
              {item.facts.length > 0 && (
                <section className="dx-drawer-section">
                  <h3>What the data says</h3>
                  <ul className="dx-list">
                    {item.facts.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </section>
              )}
              {item.context.length > 0 && (
                <section className="dx-drawer-section">
                  <h3>Where it was used</h3>
                  <ul className="dx-list">
                    {item.context.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </section>
              )}
              {fields.length > 0 && (
                <section className="dx-drawer-section">
                  <h3>Fields</h3>
                  <KV
                    items={fields.map(([k, v]) => [
                      <span className="mono">{k}</span>,
                      typeof v === 'object' ? <pre className="dx-pre dx-pre-light" style={{ maxHeight: 200 }}>{JSON.stringify(v, null, 2)}</pre> : <span className="mono">{fmtValue(v)}</span>,
                    ])}
                  />
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  )
}

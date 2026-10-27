import { useState } from 'react'
import type { Investigation } from '../../types'
import { formatMs, isNemotron, shortModel, traceKind } from '../../lib/labels'
import { auditView } from '../../lib/report'
import { href } from '../../lib/router'
import { plural } from '../../lib/runs'
import { EvidenceLink } from '../common'
import { Icon } from '../Icon'

/** Everything the agent did, and every model call it made, without one endless page. */
export function AuditView({ inv, section, runParam }: { inv: Investigation; section: string | null; runParam: string | null }) {
  const view = auditView(section)
  const at = (s: string) => href.case(inv.caseId, { runId: runParam, section: s })
  return (
    <section className="block" aria-labelledby="audit-title">
      <header className="cell-head">
        <p className="kicker">Audit trail</p>
        <h2 id="audit-title" className="cell-title">
          Everything the agent did, in order
        </h2>
      </header>
      <nav className="subtabs" aria-label="Audit views">
        <a href={at('trace')} aria-current={view === 'trace' ? 'page' : undefined}>
          Investigation events <span className="tab-count">{inv.trace.length}</span>
        </a>
        <a href={at('receipts')} aria-current={view === 'receipts' ? 'page' : undefined}>
          Model receipts <span className="tab-count">{inv.receipts.length}</span>
        </a>
      </nav>
      {view === 'trace' ? <Events inv={inv} /> : <Receipts inv={inv} />}
    </section>
  )
}

function Events({ inv }: { inv: Investigation }) {
  const types = [...new Set(inv.trace.map((t) => t.type))]
  const [type, setType] = useState('all')
  const shown = type === 'all' ? inv.trace : inv.trace.filter((t) => t.type === type)
  return (
    <div id="trace" tabIndex={-1} className="audit-panel">
      <div className="audit-tools">
        <label htmlFor="event-type">Show</label>
        <select id="event-type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All events ({inv.trace.length})</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {traceKind(t).label} ({inv.trace.filter((x) => x.type === t).length})
            </option>
          ))}
        </select>
      </div>
      <TraceStrip inv={inv} type={type} onType={setType} />
      <ol className="events">
        {shown.map((ev) => {
          const k = traceKind(ev.type)
          return (
            <li key={ev.id} className={`event kind-${ev.type}`}>
              <span className="event-time">{formatMs(ev.offsetMs)}</span>
              <span className="event-kind">
                <Icon name={k.icon} size={13} />
                {k.label}
              </span>
              <EvidenceLink id={ev.id} className="event-title">
                {ev.title}
              </EvidenceLink>
              {ev.model && <code className="event-model">{shortModel(ev.model)}</code>}
            </li>
          )
        })}
      </ol>
      {inv.status === 'running' && <p className="side-note">The saved trace ends here, before a verdict.</p>}
    </div>
  )
}

function Receipts({ inv }: { inv: Investigation }) {
  const receipts = inv.receipts
  const nemotron = receipts.filter((r) => r.routedModel && isNemotron(r.routedModel)).length
  const failed = receipts.filter((r) => r.outcome === 'failed').length
  const total = receipts.reduce((n, r) => n + (r.latencyMs ?? 0), 0)
  const hasReceiptIds = receipts.some((r) => r.receiptId || r.cacheStatus)
  return (
    <div id="receipts" tabIndex={-1} className="audit-panel">
      <p className="block-lede">
        Every model call goes through Meterless Nightshift, which reports the model that answered. {nemotron} of{' '}
        {plural(receipts.length, 'call')} went to NVIDIA Nemotron{failed > 0 && `; ${failed} failed after retries`}. Total model
        time {formatMs(total)}.
      </p>
      {receipts.length > 0 && <LatencyStrip inv={inv} />}
      {receipts.length === 0 ? (
        <p className="muted">No model calls in this trace.</p>
      ) : (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Model receipts">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Routed model</th>
                <th scope="col">Request</th>
                <th scope="col" className="num">
                  Latency
                </th>
                <th scope="col">Result</th>
                {hasReceiptIds && <th scope="col">Receipt</th>}
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.stepId}>
                  <th scope="row">{r.step}</th>
                  <td>
                    {r.routedModel ? <code>{shortModel(r.routedModel)}</code> : <span className="muted">not routed</span>}
                    {r.routedModel && !isNemotron(r.routedModel) && <span className="cell-sub warn-text">not Nemotron</span>}
                  </td>
                  <td>
                    <EvidenceLink id={r.stepId} label={`Request ${r.id} for ${r.step}`}>
                      <code>{r.id}</code>
                    </EvidenceLink>
                  </td>
                  <td className="num">{formatMs(r.latencyMs)}</td>
                  <td>
                    <span className={`outcome tone-${r.outcome === 'ok' ? 'ok' : 'fail'}`}>{r.outcome === 'ok' ? 'OK' : 'Failed'}</span>
                    {r.attempts > 1 && <span className="cell-sub">{r.attempts} attempts</span>}
                  </td>
                  {hasReceiptIds && (
                    <td>
                      {r.receiptId ? <code className="wrap-id">{r.receiptId}</code> : '—'}
                      {r.cacheStatus && <span className="cell-sub">cache {r.cacheStatus}</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="side-note">Routing only. Prompts, tokens and API keys are never stored or shown.</p>
    </div>
  )
}

/**
 * When each kind of event happened, as ticks on one elapsed-time axis per
 * kind. Choosing a lane filters the list below; the ticks themselves are a
 * picture of the same events, not separate controls.
 */
function TraceStrip({ inv, type, onType }: { inv: Investigation; type: string; onType: (t: string) => void }) {
  const timed = inv.trace.filter((t) => t.offsetMs != null)
  const end = Math.max(1, ...timed.map((t) => t.offsetMs!))
  const lanes = [...new Set(inv.trace.map((t) => t.type))]
  if (timed.length === 0) return null
  return (
    <div className="trace-strip" role="group" aria-label="Events over the run, by kind">
      {lanes.map((lane) => {
        const k = traceKind(lane)
        const n = inv.trace.filter((t) => t.type === lane).length
        return (
          <div key={lane} className={`strip-lane kind-${lane}`}>
            <button type="button" aria-pressed={type === lane} onClick={() => onType(type === lane ? 'all' : lane)}>
              <Icon name={k.icon} size={12} />
              {k.label} <span className="count">{n}</span>
            </button>
            <span className="strip-track" aria-hidden="true">
              {timed
                .filter((t) => t.type === lane)
                .map((t) => (
                  <span key={t.id} className="strip-tick" style={{ left: `${(t.offsetMs! / end) * 100}%` }} />
                ))}
            </span>
          </div>
        )
      })}
      <div className="strip-axis" aria-hidden="true">
        <span>0 s</span>
        <span>{formatMs(end)}</span>
      </div>
    </div>
  )
}

/** Each model call's latency in call order, on one shared scale. */
function LatencyStrip({ inv }: { inv: Investigation }) {
  const max = Math.max(1, ...inv.receipts.map((r) => r.latencyMs ?? 0))
  return (
    <figure className="latency-strip">
      <div className="latency-bars" aria-hidden="true">
        {inv.receipts.map((r) => (
          <span
            key={r.stepId}
            className={r.outcome !== 'ok' ? 'is-fail' : r.routedModel && isNemotron(r.routedModel) ? '' : 'is-other'}
            style={{ height: `${Math.max(2, ((r.latencyMs ?? 0) / max) * 100)}%` }}
            title={`${r.step}: ${formatMs(r.latencyMs)}`}
          />
        ))}
      </div>
      <figcaption className="kicker">
        Latency per call, in order · longest {formatMs(max)} · bars share one scale
      </figcaption>
    </figure>
  )
}

import type { ModelReceipt } from '../../types'
import { formatMs, isNemotron, shortModel } from '../../lib/labels'
import { plural } from '../../lib/runs'
import { Badge, EvidenceLink, Section } from '../common'

export function ReceiptsSection({ receipts }: { receipts: ModelReceipt[] }) {
  const nemotron = receipts.filter((r) => r.routedModel && isNemotron(r.routedModel)).length
  const failed = receipts.filter((r) => r.outcome === 'failed').length
  const total = receipts.reduce((n, r) => n + (r.latencyMs ?? 0), 0)
  const hasReceiptIds = receipts.some((r) => r.receiptId || r.cacheStatus)

  return (
    <Section
      id="receipts"
      title="Model calls and receipts"
      icon="cpu"
      lede={
        <>
          Every model call goes through Meterless Nightshift, which reports the model that actually answered.{' '}
          <strong>
            {nemotron} of {plural(receipts.length, 'call')}
          </strong>{' '}
          were routed to NVIDIA Nemotron
          {failed > 0 && `; ${failed} failed after retries`}. Total model time {formatMs(total)}.
        </>
      }
    >
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Model calls">
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
                  {r.routedModel && !isNemotron(r.routedModel) && <span className="th-sub warn-text">not Nemotron</span>}
                  {r.providerModel && r.providerModel !== r.routedModel && (
                    <span className="th-sub">provider: {shortModel(r.providerModel)}</span>
                  )}
                </td>
                <td>
                  <EvidenceLink id={r.stepId} label={`Request ${r.id} for ${r.step}`}>
                    <code>{r.id}</code>
                  </EvidenceLink>
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
                {hasReceiptIds && (
                  <td>
                    {r.receiptId ? <code>{r.receiptId}</code> : '—'}
                    {r.cacheStatus && <span className="th-sub">cache {r.cacheStatus}</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted fine-print">Shows routing only. Prompts, tokens and API keys are never stored or shown.</p>
    </Section>
  )
}

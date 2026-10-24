import type { TraceStep } from '../../types'
import { formatMs, shortModel, traceKind } from '../../lib/labels'
import { Icon } from '../Icon'
import { EvidenceLink, Pending, Section } from '../common'

export function TraceSection({ trace, running }: { trace: TraceStep[]; running: boolean }) {
  return (
    <Section id="trace" title="Investigation trace" icon="list" lede="Every step the agent took, in order.">
      <ol className="timeline">
        {trace.map((ev) => {
          const k = traceKind(ev.type)
          return (
            <li key={ev.id} className={`timeline-item kind-${ev.type}`}>
              <span className="timeline-dot" aria-hidden="true">
                <Icon name={k.icon} size={14} />
              </span>
              <div className="timeline-body">
                <span className="timeline-kind">{k.label}</span>
                <EvidenceLink id={ev.id} className="timeline-title">
                  {ev.title}
                </EvidenceLink>
                {ev.model && <code className="model-chip">{shortModel(ev.model)}</code>}
              </div>
              <span className="timeline-time small muted">{formatMs(ev.offsetMs)}</span>
            </li>
          )
        })}
      </ol>
      {running && <Pending>Waiting for the next step…</Pending>}
    </Section>
  )
}

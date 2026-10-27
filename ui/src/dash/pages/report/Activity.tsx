// Activity: what the agent did, in order. Milestones are one line each on a
// step line; the reasoning calls, queries and memory writes between them fold
// into a short caption. Every receipt and raw event is one click away.

import { isNemotron, shortModel, traceKind, VERDICT } from '../../../lib/labels'
import { traceOrigin } from '../../../lib/report'
import type { Investigation, ModelReceipt, TraceStep } from '../../../types'
import { fmtDuration } from '../../derive'
import { DIcon } from '../../icons'
import { More, Panel, Status } from '../../ui'

/** Events that move the investigation forward; everything else folds between them. */
const MILESTONE = new Set(['run_started', 'change_parsed', 'dependency_path', 'hypothesis', 'revision', 'experiment_result', 'review', 'verdict', 'run_finished', 'error'])

type Mark = 'start' | 'step' | 'pass' | 'fail' | 'warn' | 'verdict-fail' | 'verdict-neutral' | 'verdict-warn'

interface Line {
  step: TraceStep
  mark: Mark
  /** What happened since the previous milestone, e.g. "3 reasoning steps · 2 queries". */
  between: string | null
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function folded(steps: TraceStep[]): string | null {
  const calls = steps.filter((s) => s.type === 'model_call').length
  const queries = steps.filter((s) => s.type === 'usl_query').length
  const memory = steps.filter((s) => s.type === 'memory').length
  const asks = steps.filter((s) => s.type === 'experiment_requested').length
  const parts = [
    calls && plural(calls, 'reasoning step'),
    queries && plural(queries, 'query', 'queries'),
    asks && plural(asks, 'sandbox request'),
    memory && plural(memory, 'memory write'),
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

function lines(inv: Investigation): Line[] {
  const out: Line[] = []
  let pending: TraceStep[] = []
  for (const s of inv.trace) {
    if (!MILESTONE.has(s.type)) {
      pending.push(s)
      continue
    }
    let mark: Mark = 'step'
    if (s.type === 'run_started') mark = 'start'
    else if (s.type === 'experiment_result') {
      const x = inv.experiments.find((e) => e.stepId === s.id)
      mark = x?.outcome === 'pass' ? 'pass' : x?.outcome === 'fail' ? 'fail' : 'warn'
    } else if (s.type === 'error') mark = 'warn'
    else if (s.type === 'verdict' && inv.verdict) mark = `verdict-${VERDICT[inv.verdict.verdict].tone}` as Mark
    out.push({ step: s, mark, between: folded(pending) })
    pending = []
  }
  return out
}

/** The milestone in plain words, with the run's own detail where it helps. */
function title(inv: Investigation, s: TraceStep): string {
  if (s.type === 'verdict' && inv.verdict) return `Verdict: ${VERDICT[inv.verdict.verdict].label}`
  if (s.type === 'experiment_result') {
    const x = inv.experiments.find((e) => e.stepId === s.id)
    if (x) {
      const arm = { baseline: 'Without the change', candidate: 'With the change', control: 'Change reverted' }[x.variant]
      return `${arm}: ${x.outcome === 'pass' ? 'passed' : x.outcome === 'fail' ? 'failed' : 'did not finish'}`
    }
  }
  if (s.type === 'run_started') return 'Started the investigation'
  if (s.type === 'revision') return 'Revised the explanation'
  if (s.type === 'review') {
    const m = s.title.match(/^Review round \d+: ([^,]+)(?:, (\d+) issues?)?/)
    if (m?.[1] === 'approved') return 'Reviewer approved the explanation'
    if (m) return `Reviewer sent the explanation back${m[2] ? ` (${m[2]} issue${m[2] === '1' ? '' : 's'})` : ''}`
  }
  if (s.type === 'hypothesis') {
    const m = s.title.match(/^Hypothesis (\S+): (\w+)/)
    if (m?.[2] === 'open') return `Proposed hypothesis ${m[1]}`
    if (m?.[2] === 'supported') return `Hypothesis ${m[1]} supported by the runs`
    if (m?.[2] === 'refuted') return `Hypothesis ${m[1]} ruled out`
  }
  const t = s.type === 'error' ? s.title.replace(/^Error in (\w+): /, (_, stage) => `${stage.charAt(0).toUpperCase()}${stage.slice(1)} problem: `) : s.title
  return t.length > 110 ? `${t.slice(0, 108).trimEnd()}…` : t
}

interface ModelRow {
  model: string
  calls: number
  latency: number | null
  failed: number
  retried: number
  purposes: Set<string>
}

function byModel(receipts: ModelReceipt[]): ModelRow[] {
  const m = new Map<string, ModelRow & { lats: number[] }>()
  for (const r of receipts) {
    const key = r.routedModel ?? 'not reported'
    const row = m.get(key) ?? { model: key, calls: 0, latency: null, failed: 0, retried: 0, purposes: new Set(), lats: [] }
    row.calls += 1
    if (r.latencyMs != null) row.lats.push(r.latencyMs)
    if (r.outcome === 'failed') row.failed += 1
    if (r.attempts > 1) row.retried += 1
    row.purposes.add(/review/i.test(r.step) ? 'review' : 'reasoning')
    m.set(key, row)
  }
  return [...m.values()]
    .map(({ lats, ...row }) => ({ ...row, latency: lats.length ? [...lats].sort((a, b) => a - b)[Math.floor(lats.length / 2)] : null }))
    .sort((a, b) => b.calls - a.calls)
}

export function ActivityTab({ inv }: { inv: Investigation }) {
  const r = inv.receipts
  const nemo = r.filter((x) => x.routedModel && isNemotron(x.routedModel)).length
  const retried = r.filter((x) => x.attempts > 1).length
  const problems = inv.errors.length
  const models = byModel(r)
  const story = lines(inv)
  const writes = inv.memory.length

  return (
    <div className="dx-stack">
      <section className="dx-panel">
        <div className="dx-arms">
          <div className="dx-arm-card">
            <span className="dx-arm-name">Model calls</span>
            <span className="dx-arm-result">{r.length}</span>
            <span className="dx-faint dx-arm-sub">{r.length === 0 ? 'none in this run' : nemo === r.length ? 'all answered by Nemotron' : `${nemo} answered by Nemotron`}</span>
          </div>
          <div className="dx-arm-card">
            <span className="dx-arm-name">Time taken</span>
            <span className="dx-arm-result">{fmtDuration(inv.durationMs)}</span>
            <span className="dx-faint dx-arm-sub">{plural(inv.trace.length, 'event')} recorded</span>
          </div>
          <div className="dx-arm-card">
            <span className="dx-arm-name">Problems</span>
            <span className="dx-arm-result">{problems === 0 && retried === 0 ? 'None' : problems + retried}</span>
            <span className="dx-faint dx-arm-sub">
              {problems === 0 && retried === 0
                ? 'no retries or errors'
                : [retried && `${plural(retried, 'call')} retried`, problems && `${plural(problems, 'error')} logged${inv.status === 'complete' ? ', run still finished' : ''}`].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div className="dx-arm-card">
            <span className="dx-arm-name">World Model</span>
            <span className="dx-arm-result">{writes}</span>
            <span className="dx-faint dx-arm-sub">memory records written or read</span>
          </div>
        </div>
      </section>

      <Panel title="What the agent did" desc={traceOrigin(inv)} flush>
        <ol className="dx-path dx-story">
          {story.map(({ step, mark, between }) => (
            <li key={step.id} className={`dx-path-step is-${mark}`}>
              {between && <span className="dx-path-via">{between}</span>}
              <span className="dx-path-row">
                <span className="dx-path-mark" aria-hidden="true">
                  {mark === 'fail' || mark === 'verdict-fail' ? <DIcon name="x" size={11} /> : mark === 'pass' ? <DIcon name="check" size={11} /> : null}
                </span>
                <span className="dx-path-name" title={step.title}>
                  {title(inv, step)}
                </span>
                <span className="dx-sp" />
                <span className="dx-path-note dx-num">{step.offsetMs != null ? `+${fmtDuration(step.offsetMs)}` : ''}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="dx-story-more">
          <More summary={`Every event (${inv.trace.length})`}>
            <div className="dx-table-wrap">
              <table className="dx-table dx-table-compact">
                <tbody>
                  {inv.trace.map((s) => (
                    <tr key={s.id}>
                      <td className="t-num dx-faint" style={{ width: 40 }}>
                        {s.seq}
                      </td>
                      <td className="t-num dx-offset" style={{ width: 72 }}>
                        {s.offsetMs != null ? `+${(s.offsetMs / 1000).toFixed(1)}s` : '—'}
                      </td>
                      <td className="dx-faint t-nowrap" style={{ width: 96 }}>
                        {traceKind(s.type).label}
                      </td>
                      <td>{s.title}</td>
                      <td className="dx-id">{s.model ? shortModel(s.model) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </More>
        </div>
      </Panel>

      {models.length > 0 && (
        <Panel title="Models" desc="The model that answered is read from each call’s Nightshift receipt" flush>
          <ol className="dx-xruns">
            {models.map((m) => (
              <li key={m.model} className="dx-model-row">
                <span className={`dx-dot ${isNemotron(m.model) ? 'tone-accent' : 'tone-muted'}`} />
                <span className="dx-model-name">{shortModel(m.model)}</span>
                <span className="dx-faint">{[...m.purposes].map((p) => (p === 'review' ? 'checks the explanation' : 'reasons through the investigation')).join(', ')}</span>
                <span className="dx-sp" />
                <span className="dx-faint dx-num">{plural(m.calls, 'call')}</span>
                <span className="dx-faint dx-num" style={{ width: 92, textAlign: 'right' }}>
                  {m.latency != null ? `${fmtDuration(m.latency)} median` : ''}
                </span>
              </li>
            ))}
          </ol>
          <div className="dx-story-more">
            <More summary={`Every receipt (${r.length})`}>
              <div className="dx-table-wrap">
                <table className="dx-table dx-table-compact">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Step</th>
                      <th>Answered by</th>
                      <th>Result</th>
                      <th className="t-num">Time</th>
                      {r.some((x) => x.attempts > 1) && <th className="t-num">Attempts</th>}
                      {r.some((x) => x.receiptId) && <th>Receipt</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {r.map((x, i) => (
                      <tr key={x.id}>
                        <td className="t-num dx-faint">{i + 1}</td>
                        <td>{x.step}</td>
                        <td className="dx-id">{x.routedModel ? shortModel(x.routedModel) : 'not reported'}</td>
                        <td>{x.outcome === 'ok' ? <span className="dx-faint">OK</span> : <Status tone="fail">Failed</Status>}</td>
                        <td className="t-num">{fmtDuration(x.latencyMs)}</td>
                        {r.some((y) => y.attempts > 1) && <td className="t-num">{x.attempts}</td>}
                        {r.some((y) => y.receiptId) && <td className="dx-id">{x.receiptId ?? '—'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </More>
          </div>
        </Panel>
      )}

      {inv.memory.length > 0 && (
        <section className="dx-panel">
          <More summary={`World Model memory (${inv.memory.length})`}>
            <ul className="dx-xchecks">
              {inv.memory.map((m, i) => (
                <li key={i}>
                  <span className="dx-faint" style={{ minWidth: 52 }}>
                    {m.action}
                  </span>
                  <span>{m.detail}</span>
                </li>
              ))}
            </ul>
          </More>
        </section>
      )}
    </div>
  )
}

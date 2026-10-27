import { useState } from 'react'
import type { ExperimentRun, Investigation, Variant } from '../../types'
import { ARM_OUTCOME } from '../../lib/labels'
import { experimentSummary } from '../../lib/showcase'
import { EvidenceLink, Ident } from '../common'
import { Icon } from '../Icon'
import { armLabel, instrumentNotes, observationKeys, requestedBy } from './derive'

const VARIANT_NOTE: Record<Variant, string> = { baseline: 'without the change', candidate: 'with the change', control: 'change undone' }
const ORDER: Variant[] = ['baseline', 'candidate', 'control']

const show = (v: string | number | boolean | undefined) => (v === undefined ? '—' : typeof v === 'number' ? v.toLocaleString() : String(v))

/**
 * Baseline, candidate(s) and control read on one aligned scale for a single
 * observation, beside every check each run passed or failed. The reading is
 * neutral; only checks and outcomes carry pass/fail colour.
 */
export function Instrument({
  inv,
  focus = true,
  selectedId = null,
  onSelect,
}: {
  inv: Investigation
  focus?: boolean
  /** The run chosen for reading beside the map; shared with the dependency map. */
  selectedId?: string | null
  onSelect?: (id: string | null) => void
}) {
  const keys = observationKeys(inv)
  const sum = experimentSummary(inv)
  const [picked, setKey] = useState<string | null>(null)
  // A reading picked for another run isn't recorded here; fall back to this run's own.
  const key = picked && keys.includes(picked) ? picked : (sum?.key ?? keys[0] ?? '')
  const runs = [...inv.experiments].sort((a, b) => ORDER.indexOf(a.variant) - ORDER.indexOf(b.variant))
  if (runs.length === 0) {
    return (
      <section className="instrument" aria-labelledby="inst-title">
        <header className="cell-head">
          <p className="kicker">Experiment instrument</p>
          <h2 id="inst-title" className="cell-title">
            No sandbox runs recorded
          </h2>
        </header>
        <p className="cell-lede">
          {inv.status === 'running'
            ? 'No experiment had finished when this trace was saved, so there is nothing to compare.'
            : 'This run recorded no experiments, so there is nothing to compare.'}
        </p>
      </section>
    )
  }

  const checks = [...new Set(runs.flatMap((x) => x.assertions.map((a) => a.name)))]
  const numbers = runs.map((x) => x.observations[key]).filter((v): v is number => typeof v === 'number')
  const max = numbers.length ? Math.max(...numbers, 0) : 0
  const missing = ORDER.filter((v) => !runs.some((x) => x.variant === v))
  const cols = `minmax(150px, 1.15fr) minmax(180px, 2fr) repeat(${checks.length}, minmax(96px, 1fr)) minmax(116px, 0.9fr)`

  return (
    <section className="instrument" aria-labelledby="inst-title">
      <header className="cell-head inst-head">
        <div>
          <p className="kicker">Experiment instrument</p>
          <h2 id="inst-title" className="cell-title">
            Same workload, only the change differs
          </h2>
        </div>
        {focus && keys.length > 1 && (
          <label className="inst-focus">
            <span className="kicker">Reading</span>
            <select value={key} onChange={(e) => setKey(e.target.value)}>
              {keys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      <div className="inst-table" role="table" aria-label={`Sandbox runs compared on ${key}`} style={{ ['--inst-cols' as string]: cols }}>
        <div className="inst-row inst-headrow" role="row">
          <span role="columnheader">Run</span>
          <span role="columnheader">
            <Ident name={key} />
          </span>
          {checks.map((c) => (
            <span role="columnheader" key={c} className="inst-check-head">
              <span className="visually-hidden">Check </span>
              <Ident name={c} />
            </span>
          ))}
          <span role="columnheader">Outcome</span>
        </div>

        {runs.map((x) => (
          <ArmRow key={x.id} x={x} runs={runs} k={key} max={max} checks={checks} picked={x.id === selectedId} onPick={onSelect} />
        ))}

        {missing.map((v) => (
          <div className="inst-row is-missing" role="row" key={v}>
            <span role="cell" className="inst-arm">
              <span className="arm-role">{v[0].toUpperCase() + v.slice(1)}</span>
              <span className="arm-note">{VARIANT_NOTE[v]}</span>
            </span>
            <span role="cell" className="inst-missing">
              Not recorded in this run
            </span>
          </div>
        ))}
      </div>

      <div className="inst-foot">
        <ul className="inst-notes">
          {instrumentNotes(inv, key).map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
        {sum?.limit && (
          <dl className="readout inst-limit">
            <dt className="kicker">Cited limit</dt>
            <dd>
              <span className="readout-value">{sum.limit.value ?? 'not stated'}</span>
              <Ident name={sum.limit.name} />
              {sum.limit.evidenceId && (
                <span className="readout-sub">
                  from row <EvidenceLink id={sum.limit.evidenceId}>{sum.limit.evidenceId}</EvidenceLink>
                </span>
              )}
              <span className="readout-sub">Listed, not drawn on the scale: it is not recorded as the same measurement.</span>
            </dd>
          </dl>
        )}
      </div>
    </section>
  )
}

function ArmRow({
  x,
  runs,
  k,
  max,
  checks,
  picked,
  onPick,
}: {
  x: ExperimentRun
  runs: ExperimentRun[]
  k: string
  max: number
  checks: string[]
  picked: boolean
  onPick?: (id: string | null) => void
}) {
  const v = x.observations[k]
  const o = ARM_OUTCOME[x.outcome]
  const by = requestedBy(x)
  return (
    <div className={`inst-row variant-${x.variant}${x.outcome === 'pass' ? '' : ' is-fail'}${picked ? ' is-picked' : ''}`} role="row">
      <span role="cell" className="inst-arm">
        {onPick ? (
          <button type="button" className="arm-pick" aria-pressed={picked} onClick={() => onPick(picked ? null : x.id)}>
            <span className="arm-role">{armLabel(x, runs)}</span>
          </button>
        ) : (
          <span className="arm-role">{armLabel(x, runs)}</span>
        )}
        <span className="arm-note">
          {VARIANT_NOTE[x.variant]}
          {by && ` · ${by.replace(/^Requested by the /, 'asked by ').replace(/^Added by the /, 'added by ')}`}
        </span>
      </span>
      <span role="cell" className="inst-reading">
        <span className="reading-value">{x.completed ? show(v) : '—'}</span>
        {typeof v === 'number' && max > 0 && (
          <span className="reading-scale" aria-hidden="true">
            <span style={{ width: `${(Math.max(v, 0) / max) * 100}%` }} />
          </span>
        )}
      </span>
      {checks.map((c) => {
        const a = x.assertions.find((y) => y.name === c)
        return (
          <span role="cell" key={c} className={`inst-check${a ? (a.passed ? ' is-pass' : ' is-fail') : ''}`} title={a?.detail || undefined}>
            <span className="check-name">{c}</span>
            {!x.completed || !a ? (
              <span className="muted">—</span>
            ) : (
              <>
                <Icon name={a.passed ? 'check' : 'x'} size={14} />
                <span>{a.passed ? 'Pass' : 'Fail'}</span>
                {!a.passed && a.detail && <span className="check-detail">{a.detail}</span>}
              </>
            )}
          </span>
        )
      })}
      <span role="cell" className="inst-outcome">
        <span className={`outcome tone-${o.tone}`}>
          <Icon name={o.icon} size={14} />
          {x.completed ? o.label : 'Did not finish'}
        </span>
        <EvidenceLink id={x.id} className="arm-id" label={`${armLabel(x, runs)} run ${x.id}`}>
          {x.id}
        </EvidenceLink>
      </span>
    </div>
  )
}

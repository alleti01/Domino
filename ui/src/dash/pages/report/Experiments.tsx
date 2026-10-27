// Experiments: the outcome of each arm first, then only the measurements and
// checks that differ between arms (the rest one click away), then each sandbox
// run as one line that opens to its detail.

import { useState } from 'react'
import type { ArmOutcome, ExperimentRun, Investigation, Variant } from '../../../types'
import { fmtDuration, fmtValue } from '../../derive'
import { DIcon } from '../../icons'
import { FIX, fixSentence, fixStatus } from '../../fix'
import { Command, Empty, EvidenceChip, humanize, More, Panel, Tag } from '../../ui'

const ARM: Record<Variant, string> = {
  baseline: 'Without the change',
  candidate: 'With the change',
  control: 'Change reverted',
}

const ORDER: Variant[] = ['baseline', 'candidate', 'control']

/** One column per distinct result: identical repeats of an arm share a column. */
interface Col {
  key: string
  variant: Variant
  runs: ExperimentRun[]
  outcome: ArmOutcome
}

function signature(x: ExperimentRun) {
  return JSON.stringify([x.outcome, x.observations, x.assertions.map((a) => [a.name, a.passed])])
}

function columns(runs: ExperimentRun[]): Col[] {
  const cols: Col[] = []
  for (const variant of ORDER) {
    const groups = new Map<string, ExperimentRun[]>()
    for (const x of runs.filter((r) => r.variant === variant)) {
      const sig = signature(x)
      groups.set(sig, [...(groups.get(sig) ?? []), x])
    }
    let i = 0
    for (const g of groups.values()) cols.push({ key: `${variant}-${i++}`, variant, runs: g, outcome: g[0].outcome })
  }
  return cols
}

function Mark({ outcome, size = 14 }: { outcome: ArmOutcome | 'pass' | 'fail'; size?: number }) {
  return (
    <span className={`dx-xmark is-${outcome}`} aria-label={outcome === 'pass' ? 'Passed' : outcome === 'fail' ? 'Failed' : 'Error'}>
      <DIcon name={outcome === 'pass' ? 'check' : outcome === 'fail' ? 'x' : 'alert'} size={size - 4} />
    </span>
  )
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Settings as "key=value", with nested override maps flattened. */
function settingsText(params: ExperimentRun['params']) {
  return Object.entries(params)
    .flatMap(([k, v]): [string, unknown][] => (v && typeof v === 'object' ? Object.entries(v as Record<string, unknown>) : [[k, v]]))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(', ')
}

/** Re-runs with the suggested fix applied, one group per attempt (a different fix each). */
function FixChecks({ inv, runs }: { inv: Investigation; runs: ExperimentRun[] }) {
  const attempts = new Map<string, ExperimentRun[]>()
  for (const r of runs) {
    const key = JSON.stringify(r.fixOverrides)
    attempts.set(key, [...(attempts.get(key) ?? []), r])
  }
  const status = fixStatus(inv)
  return (
    <Panel
      title="Fix checks"
      desc="The experiments re-run with the suggested fix applied"
      actions={<Tag tone={FIX[status].tone}>{FIX[status].label}</Tag>}
      flush
    >
      <ol className="dx-fixlist">
        {[...attempts.values()].map((rs, i) => {
          const held = rs.every((r) => r.outcome === 'pass')
          return (
            <li key={i}>
              <Mark outcome={held ? 'pass' : 'fail'} size={16} />
              <div>
                <b>
                  {attempts.size > 1 ? `Attempt ${i + 1}: ` : ''}
                  {fixSentence(rs[0].fixOverrides ?? {})}
                </b>
                <span className="dx-faint">
                  {ORDER.filter((v) => rs.some((r) => r.variant === v))
                    .map((v) => {
                      const of = rs.filter((r) => r.variant === v)
                      const passed = of.filter((r) => r.outcome === 'pass').length
                      const word = passed === of.length ? 'passed' : passed === 0 ? 'failed' : `${of.length - passed} of ${of.length} failed`
                      return `${ARM[v]}: ${word}${of.length > 1 && (passed === 0 || passed === of.length) ? ` ×${of.length}` : ''}`
                    })
                    .join(' · ')}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
      {inv.verdict?.fix?.reasons.map((r) => (
        <p key={r} className="dx-arms-note">
          {r}
        </p>
      ))}
    </Panel>
  )
}

export function ExperimentsTab({ inv }: { inv: Investigation }) {
  const [all, setAll] = useState(false)
  const byArm = (a: ExperimentRun, b: ExperimentRun) => ORDER.indexOf(a.variant) - ORDER.indexOf(b.variant)
  // Fix re-runs are a separate question (does the fix hold?), so they stay out of the arm comparison.
  const runs = inv.experiments.filter((x) => !x.fixOverrides).sort(byArm)
  const fixRuns = inv.experiments.filter((x) => x.fixOverrides)

  if (inv.experiments.length === 0) {
    return (
      <Panel>
        <Empty icon="flask" title="No sandbox runs">
          {inv.runMode === 'no_experiments' || inv.runMode === 'no_tools'
            ? 'This run’s mode doesn’t run experiments.'
            : inv.status === 'running'
              ? 'The agent hasn’t asked for a run yet.'
              : 'The run ended before any experiment.'}
        </Empty>
      </Panel>
    )
  }

  const cols = columns(runs)
  const base = cols.find((c) => c.variant === 'baseline')
  const keys = [...new Set(runs.flatMap((r) => Object.keys(r.observations)))]
  const checks = [...new Set(runs.flatMap((r) => r.assertions.map((a) => a.name)))]
  const value = (c: Col, k: string) => c.runs[0].observations[k]
  const check = (c: Col, name: string) => c.runs[0].assertions.find((a) => a.name === name)

  const differs = (k: string) => cols.some((c) => !same(value(c, k), value(cols[0], k)))
  const checkDiffers = (n: string) => cols.some((c) => check(c, n)?.passed === false)
  const shownKeys = all ? keys : keys.filter(differs)
  const shownChecks = all ? checks : checks.filter(checkDiffers)
  const hidden = keys.length - keys.filter(differs).length + (checks.length - checks.filter(checkDiffers).length)

  // Group measurement rows by the component they belong to ("worker-runtime.exit_code").
  const groups = new Map<string, string[]>()
  for (const k of shownKeys) {
    const scope = humanize(k).scope ?? ''
    groups.set(scope, [...(groups.get(scope) ?? []), k])
  }

  const failing = runs.flatMap((r) => r.assertions.filter((a) => !a.passed).map((a) => ({ run: r, a })))
  const firstFail = failing[0]

  return (
    <div className="dx-stack">
      {/* What happened in each arm, at a glance */}
      <section className="dx-panel">
        <div className="dx-arms">
          {ORDER.filter((v) => runs.some((r) => r.variant === v)).map((v) => {
            const rs = runs.filter((r) => r.variant === v)
            const failed = rs.filter((r) => r.outcome !== 'pass').length
            const outcome: ArmOutcome = failed === 0 ? 'pass' : rs.some((r) => r.outcome === 'fail') ? 'fail' : 'error'
            return (
              <div key={v} className={`dx-arm-card is-${outcome}`}>
                <span className="dx-arm-name">{ARM[v]}</span>
                <span className="dx-arm-result">
                  <Mark outcome={outcome} size={16} />
                  {failed === 0 ? 'Passed' : failed === rs.length ? (outcome === 'fail' ? 'Failed' : 'Error') : `${failed} of ${rs.length} failed`}
                  {rs.length > 1 && <span className="dx-faint"> · {rs.length} runs</span>}
                </span>
              </div>
            )
          })}
        </div>
        {firstFail && (
          <p className="dx-arms-note">
            Failed check: <b>{humanize(firstFail.a.name).name}</b>
            {firstFail.a.detail && <span className="dx-faint"> · {firstFail.a.detail}</span>}
          </p>
        )}
      </section>

      {fixRuns.length > 0 && <FixChecks inv={inv} runs={fixRuns} />}

      {/* Only what differs, side by side */}
      <Panel
        title="What changed between runs"
        flush
        actions={
          hidden > 0 || all ? (
            <button type="button" className="dx-btn dx-btn-sm dx-btn-ghost" onClick={() => setAll((v) => !v)}>
              {all ? 'Only differences' : `Show all (${keys.length + checks.length})`}
            </button>
          ) : null
        }
      >
        {shownKeys.length === 0 && shownChecks.length === 0 ? (
          <Empty icon="flask" title="Every run measured the same">
            No measurement or check differs between the runs.
          </Empty>
        ) : (
          <div className="dx-table-wrap">
            <table className="dx-table dx-xt">
              <thead>
                <tr>
                  <th />
                  {cols.map((c) => (
                    <th key={c.key} className="t-num" title={c.runs.map((r) => r.id).join(', ')}>
                      <span className="dx-xt-head">
                        <Mark outcome={c.outcome} />
                        {ARM[c.variant]}
                        {c.runs.length > 1 && <span className="dx-faint">×{c.runs.length}</span>}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              {[...groups].map(([scope, ks]) => (
                <tbody key={scope}>
                  {scope && (
                    <tr className="dx-xt-group">
                      <td colSpan={cols.length + 1}>{scope}</td>
                    </tr>
                  )}
                  {ks.map((k) => (
                    <tr key={k}>
                      <td title={k}>{humanize(k).name}</td>
                      {cols.map((c) => {
                        const v = value(c, k)
                        const diff = base && c !== base && !same(v, value(base, k))
                        return (
                          <td key={c.key} className={`t-num${diff ? ' is-diff' : ''}${diff && c.outcome === 'fail' ? ' is-bad' : ''}`}>
                            {fmtValue(v)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              ))}
              {shownChecks.length > 0 && (
                <tbody>
                  <tr className="dx-xt-group">
                    <td colSpan={cols.length + 1}>Checks</td>
                  </tr>
                  {shownChecks.map((n) => (
                    <tr key={n}>
                      <td title={n}>{humanize(n).name}</td>
                      {cols.map((c) => {
                        const a = check(c, n)
                        return (
                          <td key={c.key} className="t-num" title={a?.detail}>
                            {a ? <Mark outcome={a.passed ? 'pass' : 'fail'} /> : <span className="dx-faint">—</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        )}
      </Panel>

      {/* Each sandbox run, one line, details on demand */}
      <Panel title="Runs" count={inv.experiments.length} flush>
        <ol className="dx-xruns">
          {[...runs, ...fixRuns].map((r) => {
            const n = (r.fixOverrides ? fixRuns : runs).filter((x) => x.variant === r.variant)
            const nth = n.length > 1 ? ` ${n.indexOf(r) + 1}` : ''
            const failed = r.assertions.filter((a) => !a.passed)
            const params = Object.entries(r.params)
            return (
              <li key={r.id} id={`x-${r.id}`}>
                <details className="dx-xrun">
                  <summary>
                    <DIcon name="chevron-right" size={14} className="dx-chev" />
                    <Mark outcome={r.outcome} />
                    <span className="dx-xrun-name">
                      {r.fixOverrides && <span className="dx-faint">Fix applied · </span>}
                      {ARM[r.variant]}
                      {nth}
                    </span>
                    {failed.length > 0 && <span className="dx-xrun-why">{humanize(failed[0].name).name.toLowerCase()} failed</span>}
                    <span className="dx-sp" />
                    <span className="dx-faint">{r.requestedBy === 'harness' ? 'added automatically' : 'chosen by the agent'}</span>
                    <span className="dx-faint dx-num" style={{ width: 56, textAlign: 'right' }}>
                      {fmtDuration(r.durationMs)}
                    </span>
                  </summary>
                  <div className="dx-xrun-b">
                    {r.rationale && <p className="dx-prose">{r.rationale}</p>}
                    {(params.length > 0 || (r.workload && r.workload !== 'default') || r.hypothesisIds.length > 0) && (
                      <p className="dx-muted">
                        {r.workload && r.workload !== 'default' && <>Workload {r.workload}. </>}
                        {params.length > 0 && <>Settings {settingsText(r.params)}. </>}
                        {r.hypothesisIds.length > 0 && (
                          <>
                            Tests{' '}
                            {r.hypothesisIds.map((h) => (
                              <EvidenceChip key={h} id={h} />
                            ))}
                          </>
                        )}
                      </p>
                    )}
                    {r.assertions.length > 0 && (
                      <ul className="dx-xchecks">
                        {r.assertions.map((a) => (
                          <li key={a.name}>
                            <Mark outcome={a.passed ? 'pass' : 'fail'} />
                            <span title={a.name}>{humanize(a.name).name}</span>
                            {a.detail && <span className="dx-faint">{a.detail}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {r.logs && (
                      <More summary="Logs">
                        <pre className="dx-pre">{r.logs}</pre>
                      </More>
                    )}
                    {r.reproduce && (
                      <More summary="Run it yourself">
                        <Command text={r.reproduce} />
                      </More>
                    )}
                  </div>
                </details>
              </li>
            )
          })}
        </ol>
      </Panel>
    </div>
  )
}

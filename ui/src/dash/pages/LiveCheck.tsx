// Live check: what happens when a pull request opens. A window with the PR's
// name; on the left the pipeline stages and the dependency path drawing itself,
// on the right a feed of plain cues; then the result. It replays a recorded
// run's real events in order, sped up, and says so; a run still being written
// (live connection) plays as it arrives. Then it moves on to the next change.

import { useEffect, useMemo, useRef, useState } from 'react'
import { VERDICT } from '../../lib/labels'
import { href, navigate } from '../../lib/router'
import { experimentSummary } from '../../lib/showcase'
import type { CaseEntry, ExperimentRun, Investigation, SiteData, TraceStep } from '../../types'
import { componentRoles, isExample, latestInv, roleFor, shortRun } from '../derive'
import { DIcon, type DIconName } from '../icons'
import { Empty, ExampleTag, humanize, PageHeader, Panel, Select, VERDICT_SHORT } from '../ui'
import { MeasureBars, outcomeText } from './report/Answer'
import { buildFlow } from './report/Flow'
import { investigationMap, layoutMap } from '../../lib/graph'
import { relationWords } from '../words'

// ---------- Script: the run's events as stages and cues ----------

const STAGES = [
  { key: 'pr', label: 'Pull request' },
  { key: 'read', label: 'Read change' },
  { key: 'layer', label: 'Semantic layer' },
  { key: 'reason', label: 'Hypothesis' },
  { key: 'sandbox', label: 'Sandbox' },
  { key: 'review', label: 'Review' },
  { key: 'verdict', label: 'Verdict' },
] as const
type StageKey = (typeof STAGES)[number]['key']

const STAGE_OF: Record<string, StageKey> = {
  run_started: 'pr',
  change_parsed: 'read',
  usl_query: 'layer',
  dependency_path: 'layer',
  hypothesis: 'reason',
  experiment_requested: 'sandbox',
  experiment_result: 'sandbox',
  review: 'review',
  revision: 'review',
  verdict: 'verdict',
  run_finished: 'verdict',
}

type Tone = 'info' | 'ok' | 'fail' | 'warn' | 'muted'

interface Cue {
  id: string
  icon: DIconName
  tone: Tone
  text: string
  detail?: string
  /** How many consecutive events this line stands for (reasoning steps, memory writes). */
  count: number
  type: string
}

const ARM = { baseline: 'Without the change', candidate: 'With the change', control: 'Change reverted' } as const

function cueFor(s: TraceStep, inv: Investigation, x: ExperimentRun | undefined): Omit<Cue, 'id' | 'count' | 'type'> {
  switch (s.type) {
    case 'run_started':
      return { icon: 'pr', tone: 'info', text: 'Pull request opened', detail: inv.change?.title }
    case 'change_parsed':
      return { icon: 'file', tone: 'info', text: 'Reading the change', detail: inv.change?.files.join(', ') }
    case 'usl_query':
      return { icon: 'data', tone: 'info', text: 'Querying the semantic layer', detail: s.title }
    case 'dependency_path':
      return { icon: 'graph', tone: 'info', text: 'Found the dependency path', detail: s.title.replace(/^Found the dependency path: /, '') }
    case 'model_call':
      return { icon: 'model', tone: 'muted', text: /review/i.test(s.title) ? 'Reviewer model checking the explanation' : 'Nemotron reasoning' }
    case 'memory':
      return { icon: 'memory', tone: 'muted', text: 'Saved to the World Model' }
    case 'hypothesis':
      return { icon: 'hypothesis', tone: 'info', text: /supported/.test(s.title) ? 'Hypothesis supported by the runs' : 'Proposed a hypothesis' }
    case 'experiment_requested':
      return { icon: 'flask', tone: 'info', text: 'Starting a sandbox run', detail: s.title.match(/a (\w+) run/)?.[1] ? ARM[s.title.match(/a (\w+) run/)![1] as keyof typeof ARM] : undefined }
    case 'experiment_result': {
      if (!x) return { icon: 'flask', tone: 'info', text: 'Sandbox run finished' }
      const failed = x.assertions.find((a) => !a.passed)
      return x.outcome === 'pass'
        ? { icon: 'check', tone: 'ok', text: `${ARM[x.variant]}: passed` }
        : { icon: 'x', tone: 'fail', text: `${ARM[x.variant]}: failed`, detail: failed ? `${humanize(failed.name).name.toLowerCase()} (${failed.detail})` : undefined }
    }
    case 'review':
      return /approved/.test(s.title)
        ? { icon: 'check', tone: 'ok', text: 'Reviewer approved the explanation' }
        : { icon: 'alert', tone: 'warn', text: 'Reviewer sent the explanation back', detail: s.title.match(/\d+ issues?/)?.[0] }
    case 'revision':
      return { icon: 'file', tone: 'info', text: 'Revised the explanation' }
    case 'error':
      return { icon: 'alert', tone: 'warn', text: 'Model hiccup, retrying', detail: s.title.replace(/^Error in \w+: /, '') }
    case 'verdict':
      return inv.verdict
        ? { icon: 'shield', tone: inv.verdict.verdict === 'reproduced_failure' ? 'fail' : 'ok', text: `Judge decided: ${VERDICT_SHORT[inv.verdict.verdict]}` }
        : { icon: 'shield', tone: 'info', text: 'Judge decided' }
    case 'run_finished':
      return { icon: 'check', tone: 'muted', text: 'Check complete' }
    default:
      return { icon: 'dot', tone: 'muted', text: s.title }
  }
}

/** Cues for the first `n` events; repeated reasoning and memory lines fold into one with a count. */
function cuesUpTo(inv: Investigation, n: number): Cue[] {
  const out: Cue[] = []
  for (const s of inv.trace.slice(0, n)) {
    const x = inv.experiments.find((e) => e.stepId === s.id)
    const c = cueFor(s, inv, x)
    const last = out[out.length - 1]
    if (last && (s.type === 'model_call' || s.type === 'memory') && last.type === s.type && last.text === c.text) {
      last.count += 1
      continue
    }
    out.push({ ...c, id: s.id, count: 1, type: s.type })
  }
  return out
}

/** When each event appears, in ms from the start: real order and rhythm, compressed to about 22 s. */
function schedule(trace: TraceStep[]): number[] {
  const offs = trace.map((s) => s.offsetMs ?? 0)
  const total = Math.max(1, offs[offs.length - 1] ?? 1)
  const scale = 22000 / total
  const times: number[] = []
  let t = 600
  for (let i = 0; i < trace.length; i++) {
    if (i > 0) t += Math.max(140, Math.min(1500, (offs[i] - offs[i - 1]) * scale))
    times.push(t)
  }
  return times
}

const RESULT_HOLD = 9000

// ---------- View ----------

function StageRail({ inv, n, done }: { inv: Investigation; n: number; done: boolean }) {
  const seen = inv.trace.slice(0, n)
  const reached = Math.max(0, ...seen.map((s) => STAGES.findIndex((st) => st.key === STAGE_OF[s.type])).filter((i) => i >= 0))
  const sandboxFailed = seen.some((s) => s.type === 'experiment_result' && inv.experiments.find((e) => e.stepId === s.id)?.outcome === 'fail')
  const verdictIn = seen.some((s) => s.type === 'verdict')
  return (
    <ol className="dx-live-stages">
      {STAGES.map((st, i) => {
        let state: 'pending' | 'running' | 'done' | 'failed' = i < reached ? 'done' : i === reached ? (done ? 'done' : 'running') : 'pending'
        if (st.key === 'sandbox' && sandboxFailed && state !== 'pending') state = state === 'running' ? 'running' : 'failed'
        if (st.key === 'verdict' && verdictIn && inv.verdict?.verdict === 'reproduced_failure') state = 'failed'
        return (
          <li key={st.key} className={`is-${state}`}>
            <span className="dx-live-stage-mark" aria-hidden="true">
              {state === 'done' ? <DIcon name="check" size={11} /> : state === 'failed' ? <DIcon name="x" size={11} /> : null}
            </span>
            <span className="dx-live-stage-label">{st.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** With no failure path in the verdict, the graph's main line: the longest chain from the change. */
function mainLine(inv: Investigation): ReturnType<typeof buildFlow> {
  const map = investigationMap(inv)
  const layout = layoutMap(map)
  const line = map.nodes
    .filter((n) => layout.at.get(n.id)?.row === 0)
    .sort((a, b) => (layout.at.get(a.id)?.layer ?? 0) - (layout.at.get(b.id)?.layer ?? 0))
  return line.map((n, i) => {
    const e = i > 0 ? map.edges.find((x) => x.from === line[i - 1].id && x.to === n.id) : undefined
    return {
      id: n.id,
      name: n.isChange ? 'The change' : n.label,
      kind: n.kind,
      role: n.isChange ? (inv.change?.files.map((f) => f.split('/').pop()).join(', ') ?? null) : null,
      via: e ? { words: relationWords(e.relation), raw: e.relation, inferred: e.status !== 'observed' } : null,
      state: n.isChange ? ('change' as const) : ('pass' as const),
      badge: null,
    }
  })
}

function PathView({ inv, n }: { inv: Investigation; n: number }) {
  const seen = inv.trace.slice(0, n)
  const found = seen.some((s) => s.type === 'dependency_path')
  const steps = useMemo(() => {
    const flow = buildFlow(inv)
    return flow.length > 1 ? flow : mainLine(inv)
  }, [inv])
  const roles = useMemo(() => componentRoles(inv), [inv])
  const failedSeen = seen.some((s) => s.type === 'experiment_result' && inv.experiments.find((e) => e.stepId === s.id)?.outcome === 'fail')
  const running = seen.some((s) => s.type === 'experiment_requested') && !seen.some((s) => s.type === 'verdict')

  // Runs happen one after another: the k-th request belongs to the k-th result.
  const requested = seen.filter((s) => s.type === 'experiment_requested').length
  const ordered = [...inv.experiments].sort((a, b) => Number(a.stepId.split('-')[1]) - Number(b.stepId.split('-')[1]))
  const arms = ordered
    .map((x, k) => {
      const res = seen.some((s) => s.id === x.stepId)
      return { x, state: res ? x.outcome : k < requested ? 'running' : 'pending' }
    })
    .filter((a) => a.state !== 'pending')

  if (!found) {
    return (
      <div className="dx-live-wait">
        <span className="dx-live-spinner" aria-hidden="true" />
        <span>Looking for what this change touches…</span>
      </div>
    )
  }
  return (
    <div className="dx-live-path">
      <ol className="dx-live-nodes">
        {steps.map((s, i) => {
          const isBroken = s.state === 'broken' && failedSeen
          const state = s.state === 'change' ? 'change' : isBroken ? 'broken' : s.state === 'limit' ? 'limit' : 'pass'
          const role = s.state === 'change' ? s.role : (roleFor(s.name, roles) ?? undefined)
          return (
            <li key={s.id} className={`is-${state}${running && !isBroken && s.state !== 'change' ? ' is-testing' : ''}`} style={{ ['--i' as string]: i }}>
              {i > 0 && (
                <span className="dx-live-link">
                  <span className={`dx-live-arrow${s.via?.inferred ? ' is-inferred' : ''}${isBroken ? ' is-broken' : ''}`} aria-hidden="true">
                    <span />
                  </span>
                  {s.via && <span className="dx-live-link-words">{s.via.words}</span>}
                </span>
              )}
              <span className="dx-live-node" title={role ?? undefined}>
                <span className="dx-live-node-mark">{isBroken ? <DIcon name="x" size={10} /> : null}</span>
                <span className="dx-live-node-name">{s.name}</span>
                {isBroken && s.badge && <span className="dx-live-node-badge">{s.badge.replace('Stops · ', 'stops, ')}</span>}
                {s.state === 'limit' && s.badge && <span className="dx-live-node-via">{s.badge}</span>}
              </span>
            </li>
          )
        })}
      </ol>
      {arms.length > 0 && (
        <div className="dx-live-arms">
          <span className="dx-sum-label">Sandbox</span>
          {arms.map(({ x, state }) => (
            <span key={x.id} className={`dx-live-arm is-${state}`}>
              {state === 'running' ? <span className="dx-live-spinner is-sm" /> : <DIcon name={state === 'pass' ? 'check' : state === 'fail' ? 'x' : 'alert'} size={11} />}
              {ARM[x.variant]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Feed({ cues, running }: { cues: Cue[]; running: boolean }) {
  const ref = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [cues.length, cues[cues.length - 1]?.count])
  return (
    <ol className="dx-live-feed" aria-live="polite" ref={ref}>
      {cues.map((c, i) => {
        const current = running && i === cues.length - 1
        return (
          <li key={c.id} className={`tone-${c.tone}${current ? ' is-current' : ''}`}>
            <span className="dx-live-feed-icon">{current && c.tone !== 'fail' && c.tone !== 'ok' ? <span className="dx-live-spinner is-sm" /> : <DIcon name={c.icon} size={13} />}</span>
            <span className="dx-live-feed-text">
              <span>
                {c.text}
                {c.count > 1 && <span className="dx-faint"> ×{c.count}</span>}
              </span>
              {c.detail && <span className="dx-live-feed-detail">{c.detail}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Result({ inv, caseEntry }: { inv: Investigation; caseEntry: CaseEntry }) {
  if (!inv.verdict) return null
  const t = outcomeText(inv)
  const x = experimentSummary(inv)
  const v = VERDICT[inv.verdict.verdict]
  const icon = inv.verdict.verdict === 'reproduced_failure' ? 'x-circle' : inv.verdict.verdict === 'inconclusive' ? 'help-circle' : 'minus-circle'
  return (
    <div className="dx-live-result">
      <div className="dx-answer-head">
        <span className={`dx-answer-icon tone-${v.tone}`}>
          <DIcon name={icon} size={24} />
        </span>
        <div>
          <h2 className="dx-answer-headline">{t.title}</h2>
          <p className="dx-muted">{t.sub}</p>
        </div>
      </div>
      {x && <MeasureBars x={x} />}
      <div className="dx-row dx-wrap" style={{ gap: 8 }}>
        <a className="dx-btn dx-btn-primary" href={href.case(caseEntry.id, { runId: inv.runId })}>
          Open the report <DIcon name="arrow-right" size={14} />
        </a>
        <a className="dx-btn" href={href.case(caseEntry.id, { runId: inv.runId, view: 'pr' })}>
          <DIcon name="pr" size={14} /> PR comment
        </a>
      </div>
    </div>
  )
}

export function LiveCheck({ site, caseId }: { site: SiteData; caseId: string | null }) {
  const cases = useMemo(() => site.cases.filter((c) => latestInv(c)?.trace.length), [site.cases])
  const idx = Math.max(0, cases.findIndex((c) => c.id === caseId))
  const nextId = cases.length ? cases[(idx + 1) % cases.length].id : null
  const caseEntry = cases[idx]
  const inv = caseEntry ? latestInv(caseEntry) : null
  const live = inv?.status === 'running'

  const times = useMemo(() => (inv ? schedule(inv.trace) : []), [inv])
  const [n, setN] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [round, setRound] = useState(0)
  const total = inv?.trace.length ?? 0
  const finished = !live && n >= total && total > 0

  // Restart whenever the change (or the round) changes.
  useEffect(() => setN(live ? total : 0), [inv?.runId, round, live, total])

  // Reveal the next event at its scheduled time.
  useEffect(() => {
    if (!inv || live || !playing || n >= total) return
    const wait = n === 0 ? times[0] : times[n] - times[n - 1]
    const t = setTimeout(() => setN((v) => v + 1), wait)
    return () => clearTimeout(t)
  }, [inv, live, playing, n, total, times])

  // Hold on the result, then go on to the next change.
  // Depends only on stable values: the live connection re-renders this page every few seconds.
  useEffect(() => {
    if (!finished || !playing || !nextId) return
    const t = setTimeout(() => {
      if (nextId === caseEntry?.id) setRound((r) => r + 1)
      else navigate(href.live(nextId), { replace: true })
    }, RESULT_HOLD)
    return () => clearTimeout(t)
  }, [finished, playing, nextId, caseEntry?.id])

  if (!caseEntry || !inv) {
    return (
      <Panel>
        <Empty icon="play" title="Nothing to replay yet">
          Runs appear here once the agent has written one.
        </Empty>
      </Panel>
    )
  }

  const cues = cuesUpTo(inv, n)
  const v = inv.verdict ? VERDICT[inv.verdict.verdict] : null
  const statusLabel = finished && v ? (inv.verdict!.verdict === 'reproduced_failure' ? 'Failed' : inv.verdict!.verdict === 'inconclusive' ? 'Inconclusive' : 'Passed') : 'Running'
  const statusTone = finished && v ? v.tone : 'accent'

  return (
    <>
      <PageHeader
        title="Live check"
        sub="What happens when a pull request opens: Domino reads the change, joins what the connected systems know, tests it in a sandbox and posts a check. This page replays a recorded run’s real events in order, sped up; a run still being written plays as it arrives."
        meta={
          <>
            {isExample(caseEntry.kind) && <ExampleTag />}
            <span className="dx-live-mode">{live ? '● Live run' : `Replay of recorded run ${shortRun(inv.runId)}`}</span>
          </>
        }
        actions={
          <>
            <Select
              label="Change"
              prefix="Change"
              align="right"
              value={caseEntry.id}
              onChange={(id) => navigate(href.live(id))}
              options={cases.map((c) => ({
                value: c.id,
                text: `${latestInv(c)?.change?.title ?? c.label} ${c.label}`,
                tone: c.runs[0]?.verdict ? VERDICT[c.runs[0].verdict].tone : undefined,
                label: c.label,
              }))}
            />
            <button type="button" className="dx-btn dx-btn-icon" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
              <DIcon name={playing ? 'pause' : 'play'} size={14} />
            </button>
            <button type="button" className="dx-btn dx-btn-icon" onClick={() => setRound((r) => r + 1)} aria-label="Restart" title="Restart">
              <DIcon name="restart" size={14} />
            </button>
          </>
        }
      />

      <section className="dx-live-window" key={`${inv.runId}:${round}`}>
        <header className="dx-live-head">
          <DIcon name="pr" size={16} />
          <div className="dx-live-title">
            <b>{inv.change?.title ?? caseEntry.label}</b>
            <span className="dx-faint">
              {caseEntry.label} · {inv.change?.files.length ?? 0} file{inv.change?.files.length === 1 ? '' : 's'}
            </span>
          </div>
          <span className={`dx-live-status tone-${statusTone}`}>
            {statusLabel === 'Running' ? <span className="dx-live-spinner is-sm" /> : <span className="dx-dot" />}
            Domino check · {statusLabel}
          </span>
        </header>

        <StageRail inv={inv} n={n} done={finished} />

        <div className="dx-live-body">
          <div className="dx-live-left">{finished ? <Result inv={inv} caseEntry={caseEntry} /> : <PathView inv={inv} n={n} />}</div>
          <div className="dx-live-right">
            <Feed cues={cues} running={!finished} />
          </div>
        </div>

        <div className="dx-live-progress" aria-hidden="true">
          <span style={{ width: `${total ? (Math.min(n, total) / total) * 100 : 0}%` }} />
        </div>
      </section>
    </>
  )
}

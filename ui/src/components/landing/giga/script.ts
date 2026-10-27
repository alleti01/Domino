// The investigation as a timed script for the machine replay. Times are in
// seconds of playback. Every line of content comes from the saved run.

import type { Investigation } from '../../../types'
import { VERDICT, isNemotron } from '../../../lib/labels'
import { experimentSummary } from '../../../lib/showcase'

export interface TypedRow {
  kind: 'engineer'
  text: string
  typeStart: number
  states: [number, string][]
  at: number
}
export interface AgentRow {
  kind: 'agent'
  text: string
  words: string[]
  at: number
  stag: number
}
export interface ActionLine {
  pendAt: number | null
  pend: string | null
  at: number
  text: string
  risk?: string
}
export interface ActionRow {
  kind: 'action'
  at: number
  phases: { at: number; text: string }[]
  done: { at: number; text: string }
  tone: 'accent' | 'fail' | null
  lines: ActionLine[]
  collapseAt: number | null
}
export type Row = TypedRow | AgentRow | ActionRow

export interface Script {
  rows: Row[]
  cuts: number[]
  labels: string[]
  end: number
  title: string
}

// Small seeded generator so typing jitter is the same on every visit.
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Key = string | { pause: number } | { back: number }

const plain = (key: string) => (key.split('.').pop() ?? key).replace(/[_-]+/g, ' ')
const firstSentence = (text: string | null | undefined, max = 200) => {
  if (!text) return ''
  const s = text.split(/(?<=[.!?])\s/)[0] ?? text
  if (s.length <= max) return s
  // Cut at a word, never inside one.
  const cut = s.slice(0, max).replace(/[\s,;:]+\S*$/, '')
  return `${cut}…`
}

export function buildScript(inv: Investigation): Script {
  const rows: Row[] = []
  let T = 0.9
  const cuts: number[] = [0]

  const engineer = (keys: Key[], base = 0.042, jit = 0.018) => {
    const r = rng(JSON.stringify(keys).length * 31 + 7)
    const states: [number, string][] = []
    let t = T
    let text = ''
    for (const k of keys) {
      if (typeof k === 'string') {
        for (const ch of k) {
          const prev = text[text.length - 1]
          t += base + (r() - 0.5) * 2 * jit
          if (prev === '.' || prev === ',' || prev === '?') t += 0.17
          text += ch
          states.push([t, text])
        }
      } else if ('pause' in k) t += k.pause
      else
        for (let i = 0; i < k.back; i++) {
          t += 0.075
          text = text.slice(0, -1)
          states.push([t, text])
        }
    }
    const at = t + 0.45
    rows.push({ kind: 'engineer', text, typeStart: T, states, at })
    T = at
  }
  const agent = (text: string, lead = 0.5) => {
    if (!text) return
    const at = T + lead
    const words = text.split(' ')
    const stag = 0.045
    rows.push({ kind: 'agent', text, words, at, stag })
    T = at + (words.length - 1) * stag + 0.22
  }
  const action = (o: { lead?: number; phases: [number, string][]; done: [number, string]; tone?: 'accent' | 'fail'; lines: { pend?: [number, string]; res: [number, string]; risk?: string }[] }) => {
    const at = T + (o.lead ?? 0.35)
    rows.push({
      kind: 'action',
      at,
      phases: o.phases.map(([dt, text]) => ({ at: at + dt, text })),
      done: { at: at + o.done[0], text: o.done[1] },
      tone: o.tone ?? null,
      lines: o.lines.map((l) => ({ pendAt: l.pend ? at + l.pend[0] : null, pend: l.pend ? l.pend[1] : null, at: at + l.res[0], text: l.res[1], risk: l.risk })),
      collapseAt: null,
    })
    T = at + o.done[0]
  }
  const cut = () => cuts.push(T + 0.3)

  // ---- The run, from the trace ----
  const change = inv.change
  // The first added line that is code, not a comment.
  const plus = change?.diff
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1).trim())
    .find((l) => l && !/^(--|#|\/\/)/.test(l))
  const title = change?.title ?? 'a proposed change'
  const queries = inv.trace.filter((t) => t.type === 'usl_query').map((t) => t.title)
  const facts = inv.chain.causal.flatMap((l) => (l.detail ? [{ source: (l.refs[0]?.source ?? 'record').replace(/_/g, ' '), detail: l.detail }] : []))
  const systems = [...new Set(inv.chain.nodes.flatMap((n) => n.refs.map((r) => r.source)))].filter(Boolean)
  const hyp = inv.hypotheses.find((h) => h.status === 'supported') ?? inv.hypotheses[0]
  const x = experimentSummary(inv)
  const key = x?.key
  const runs = inv.experiments.filter((e) => e.completed).slice(0, 4)
  const v = inv.verdict
  const reviewer = inv.review?.reviewerModel?.split('/').pop() ?? null
  const calls = inv.receipts.length
  const nemotron = inv.receipts.filter((r) => isNemotron(r.routedModel ?? '')).length

  // 1 · The engineer asks (types the PR, with a slip).
  const ask = `Can I ship this? ${title}.`
  const slip = Math.min(18, Math.floor(ask.length * 0.55))
  engineer([ask.slice(0, slip), 'xq', { pause: 0.28 }, { back: 2 }, ask.slice(slip), ...(plus ? [{ pause: 0.35 }, ` ${plus}`] : [])])
  cut()

  // 2 · Domino maps the systems through the semantic layer.
  action({
    lead: 0.4,
    phases: [[0, 'Querying the semantic layer']],
    done: [2.3, `${queries.length || 'Several'} queries · ${systems.length} systems joined`],
    lines: [
      ...facts.slice(0, 3).map((f, i) => ({ pend: [0.08 + i * 0.08, `Reading ${f.source}`] as [number, string], res: [1.2 + i * 0.4, `${f.source}: ${f.detail}`] as [number, string] })),
      { pend: [0.32, 'Assessing risk'], res: [2.1, 'Risk: an inferred link'], risk: 'Inferred link' },
    ],
  })
  agent(`I joined what ${systems.length} systems know about this change. ${firstSentence(hyp?.claim, 150)}`)
  cut()

  // 3 · The hypothesis, recorded and made testable.
  action({
    phases: [[0, 'Recording a hypothesis']],
    done: [1.4, `Hypothesis ${hyp?.id ?? ''} recorded`],
    lines: [
      { pend: [0.1, 'Choosing what would falsify it'], res: [1.1, firstSentence(hyp?.falsifiedBy, 90) || 'A run that stays within limits'] },
      { pend: [0.2, 'Assessing risk'], res: [1.3, 'Risk: worth a sandbox run'], risk: 'Needs a test' },
    ],
  })
  agent('Running it in the sandbox: once without the change, once with it, and once undone.', 0.4)
  cut()

  // 4 · The sandbox: real runs, failures in red.
  action({
    phases: [
      [0, 'Starting the sandbox'],
      [0.6, 'Running baseline, candidate and control'],
    ],
    done: [3.6, 'Sandbox runs complete'],
    tone: x?.candidateFailed ? 'fail' : undefined,
    lines: [
      ...runs.map((r, i) => {
        const failed = r.assertions.find((a) => !a.passed)
        const value = key ? `${plain(key)} ${String(r.observations[key] ?? 'n/a')}` : ''
        return {
          pend: [0.7 + i * 0.12, `Running ${r.variant}`] as [number, string],
          res: [1.6 + i * 0.5, `${r.variant}: ${value} · ${failed ? `failed ${failed.name}` : 'passed'}`] as [number, string],
        }
      }),
      { pend: [0.9, 'Assessing risk'], res: [3.3, x?.candidateFailed ? 'Risk: failure reproduced' : 'Risk: none observed'], risk: x?.candidateFailed ? 'Reproduced' : 'None observed' },
    ],
  })
  agent(firstSentence(v?.cause ?? v?.headline, 230) || 'No explanation recorded.', 0.5)
  cut()

  // 5 · Code decides, a second model reviews, the report is written.
  action({
    lead: 0.7,
    phases: [[0, 'Judging the runs']],
    done: [1.0, v ? VERDICT[v.verdict].label : 'No verdict'],
    tone: 'accent',
    lines: [
      { res: [1.0, 'Decided by the deterministic judge, not the model'] },
      { res: [1.12, x ? `${plain(x.key)}: ${String(x.baseline)} → ${String(x.candidate)}${x.limit?.value != null ? ` · limit ${x.limit.value}` : ''}` : 'Runs compared'] },
    ],
  })
  action({
    lead: 1.1,
    phases: [[0, 'Reviewing the explanation']],
    done: [3.2, 'Report ready'],
    tone: 'accent',
    lines: [
      { pend: [0.15, 'Checking every claim against the evidence'], res: [1.5, inv.review?.outcome === 'approved' ? `Approved by ${reviewer ?? 'the reviewer'}` : `Review: ${inv.review?.outcome ?? 'not run'}`] },
      { pend: [1.5, 'Writing the PR comment'], res: [2.9, `${nemotron}/${calls} model calls on NVIDIA Nemotron`] },
    ],
  })
  cut()
  const end = T + 5
  cuts[cuts.length - 1] = Math.max(cuts[cuts.length - 1], T + 1.2)

  // Working blocks fold away when the next ask begins (accent blocks stay open).
  rows.forEach((r, i) => {
    if (r.kind !== 'action' || r.tone === 'accent') return
    const next = rows.slice(i + 1).find((q) => q.kind === 'agent')
    r.collapseAt = next ? next.at + 1.6 : null
  })

  return {
    rows,
    cuts,
    labels: ['A change is proposed', 'Domino maps the systems', 'Domino forms a hypothesis', 'Domino runs the sandbox', 'Code decides'],
    end,
    title,
  }
}

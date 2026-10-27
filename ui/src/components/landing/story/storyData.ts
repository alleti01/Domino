// What the 3D story shows, derived from one saved run. The arrangement on
// screen is illustrative; every name, kind, source and link comes from the run.

import type { ArmOutcome, HypothesisStatus, LinkStatus, ReviewOutcome, Variant, Verdict } from '../../../types'
import { VERDICT_RULE, isNemotron } from '../../../lib/labels'
import { chainTiles, experimentSummary, type ExperimentSummary, type Showcase } from '../../../lib/showcase'

export interface StoryNode {
  id: string
  label: string
  kind: string
  /** The source system the data layer found it in, e.g. "runtime_config". */
  source: string | null
  /** Evidence rows cited for it (shown as pips, capped at 6). */
  rows: number
  /** Position on the causal path, or -1 for a component that isn't on it. */
  step: number
}

export interface StoryLink {
  /** Indices into `path`. */
  from: number
  to: number
  relation: string
  status: LinkStatus
}

export interface StoryData {
  caseId: string
  caseLabel: string
  /** On the causal path, in order: the change first. */
  path: StoryNode[]
  /** Everything else the semantic layer returned around the change. */
  others: StoryNode[]
  links: StoryLink[]
  sources: string[]
  /** The first link the data layer inferred rather than observed: the assumption to test. */
  assumption: StoryLink | null
  /** The model's hypothesis the experiments were run for. */
  hypothesis: {
    id: string
    claim: string
    falsifiedBy: string
    status: HypothesisStatus
    history: HypothesisStatus[]
  } | null
  /** Baseline / candidate / control on the measurement that moved, with the limit if the data states it. */
  experiment: ExperimentSummary | null
  /** Every sandbox run, in order, with its value on the measured key. */
  runs: { id: string; variant: Variant; outcome: ArmOutcome; failed: string | null; value: string | number | boolean | null }[]
  /** The three runs the landing page compares: baseline, the (first failing) candidate, control. Repeats stay in the report. */
  trio: StoryData['runs']
  /** Index into `path` of the component that broke in the candidate run, if one did. */
  breaks: number
  verdict: { verdict: Verdict; decidedBy: string } | null
  review: ReviewOutcome | null
  reviewerModel: string | null
  /** Evidence rows cited per source system, in first-seen order. */
  rowsBySource: { source: string; rows: number }[]
  /** One stated fact per source system, from the causal chain: e.g. runtime_config → "max_entries=200". */
  facts: { source: string; text: string }[]
  /** What the data layer states about the inferred link, e.g. "max_entries=200". */
  assumptionDetail: string | null
  evidence: { rows: number; calls: number; nemotron: number; memory: number; durationMs: number | null }
}

export function storyData(show: Showcase): StoryData | null {
  const tiles = chainTiles(show.inv)
  if (tiles.length < 2) return null
  const nodes = new Map(show.inv.chain.nodes.map((n) => [n.id, n]))
  const node = (id: string, label: string, kind: string, step: number): StoryNode => {
    const refs = nodes.get(id)?.refs ?? []
    return {
      id,
      label,
      kind,
      source: refs[0]?.source ?? null,
      rows: refs.reduce((sum, r) => sum + r.ids.length, 0),
      step,
    }
  }

  const path = tiles.map((t, i) => node(t.id, t.label, t.kind, i))
  const onPath = new Set(path.map((n) => n.id))
  const others = show.inv.chain.nodes.filter((n) => !onPath.has(n.id)).map((n) => node(n.id, n.label, n.kind, -1))
  const links = tiles.slice(1).map((t, i) => ({ from: i, to: i + 1, relation: t.link!.relation, status: t.link!.status }))
  const sources = [...new Set([...path, ...others].flatMap((n) => (n.source ? [n.source] : [])))]

  const inv = show.inv
  const assumption = links.find((l) => l.status === 'inferred') ?? null
  const h = inv.hypotheses.find((x) => x.status === 'supported') ?? inv.hypotheses.find((x) => x.experimentIds.length > 0) ?? inv.hypotheses[0]
  const experiment = experimentSummary(inv)
  const runs = inv.experiments
    .filter((x) => x.completed)
    .map((x) => ({
      id: x.id,
      variant: x.variant,
      outcome: x.outcome,
      failed: x.assertions.find((a) => !a.passed)?.name ?? null,
      value: experiment ? (x.observations[experiment.key] ?? null) : null,
    }))
  const rows = new Set(
    [...inv.chain.nodes.flatMap((n) => n.refs), ...inv.chain.causal.flatMap((l) => l.refs)].flatMap((r) =>
      r.ids.map((id) => `${r.source}:${id}`),
    ),
  )
  const bySource = new Map<string, Set<string>>()
  for (const r of inv.chain.nodes.flatMap((n) => n.refs)) {
    const set = bySource.get(r.source) ?? new Set<string>()
    r.ids.forEach((id) => set.add(id))
    bySource.set(r.source, set)
  }
  // What breaks is the component bound by the inferred limit, else the end of the path.
  const breaks = experiment?.candidateFailed ? (assumption ? assumption.from : path.length - 1) : -1

  return {
    caseId: show.caseEntry.id,
    caseLabel: show.caseEntry.label,
    path,
    others,
    links,
    sources,
    assumption,
    hypothesis: h
      ? { id: h.id, claim: firstSentence(h.claim), falsifiedBy: h.falsifiedBy, status: h.status, history: h.history }
      : null,
    experiment,
    runs,
    trio: [
      runs.find((r) => r.variant === 'baseline'),
      runs.find((r) => r.variant === 'candidate' && r.outcome !== 'pass') ?? runs.find((r) => r.variant === 'candidate'),
      runs.find((r) => r.variant === 'control'),
    ].filter((r): r is StoryData['runs'][number] => !!r),
    breaks,
    verdict: inv.verdict ? { verdict: inv.verdict.verdict, decidedBy: inv.verdict.decidedBy } : null,
    review: inv.review?.outcome ?? null,
    reviewerModel: inv.review?.reviewerModel ?? null,
    rowsBySource: [...bySource].map(([source, ids]) => ({ source, rows: ids.size })),
    facts: (() => {
      // What each system holds on the path, with the value the data states where there is one
      // (the change's statement, the limit's setting).
      const into = new Map(links.map((l, i) => [l.to, inv.chain.causal[i]?.detail ?? null]))
      const firstDetail = inv.chain.causal[0]?.detail ?? null
      const bySystem = new Map<string, string[]>()
      path.forEach((n, i) => {
        if (!n.source) return
        const detail = i === 0 ? firstDetail : n.kind === 'setting' || n.kind === 'limit' ? into.get(i) : null
        const value = detail?.match(/=\s*(\S+)\s*$/)?.[1]
        const name = i === 0 ? `Change ${n.label}` : shortName(n)
        const text = value ? `${name}: ${value}` : detail ? `${name}: ${detail}` : name
        bySystem.set(n.source, [...(bySystem.get(n.source) ?? []), text])
      })
      return [...bySystem].map(([source, items]) => ({ source, text: items.join(', ') }))
    })(),
    assumptionDetail: (() => {
      const link = inv.chain.causal.find((l) => l.status === 'inferred')
      return link?.detail ?? null
    })(),
    evidence: {
      rows: rows.size,
      calls: inv.receipts.length,
      nemotron: inv.receipts.filter((r) => r.routedModel && isNemotron(r.routedModel)).length,
      memory: inv.memory.length,
      durationMs: inv.durationMs,
    },
  }
}

export const relationText = (relation: string) => relation.replace(/_/g, ' ')

/** The model's claims run long; the landing page quotes the first sentence and links to the rest. */
export function firstSentence(text: string) {
  const m = text.match(/^.+?[.!?](?=\s|$)/)
  return (m ? m[0] : text).trim()
}

/**
 * A short, human-readable name for the scene ("Bundle builder", "Max entries");
 * the full identifier stays in the page text and the report.
 */
export function shortName(n: StoryNode) {
  if (n.step === 0) return `Change ${n.label}`
  // File names read fine as they are.
  if (/\.[a-z0-9]{2,5}$/i.test(n.label) && n.kind !== 'setting') return n.label
  const last = n.label.split('.').pop() ?? n.label
  const words = last.replace(/^svc_/, '').replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** How the judge reached each verdict, in plain words. */
export const JUDGE_RULE = VERDICT_RULE

/** Story time at which each sandbox run plays (DominoScene uses the same schedule). */
export const runTime = (i: number, count: number) => 2.78 + (i * 0.4) / Math.max(1, count)

/** Reduced motion: each chapter holds its finished state instead of animating between them. */
const HELD = [0, 1.2, 2.1, 3.24, 4]
export const heldState = (s: number) => HELD[Math.min(HELD.length - 1, Math.max(0, Math.round(s)))]

/** A measurement key as plain words: "meta-store.rows_visible_to_builder" → "Rows visible to builder". */
export function measureLabel(key: string) {
  const words = (key.split('.').pop() ?? key).replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

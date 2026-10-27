// Numbers the console shows, computed from the loaded runs only. Nothing here
// is hard-coded: every figure traces back to a field in a saved trace.

import { isNemotron } from '../lib/labels'
import { latestState, type LatestState } from '../lib/report'
import type { CaseEntry, Investigation, RunEntry, SiteData, Verdict } from '../types'

export interface RunRow {
  caseEntry: CaseEntry
  run: RunEntry
  inv: Investigation | null
}

/** Every run on the site, newest first. */
export function allRuns(site: SiteData): RunRow[] {
  return site.cases
    .flatMap((c) => c.runs.map((run) => ({ caseEntry: c, run, inv: run.load.ok ? run.load.investigation : null })))
    .sort((a, b) => (b.run.startedAt || '').localeCompare(a.run.startedAt || ''))
}

export interface Agreement {
  /** Full-mode runs that reached a verdict (outages excluded). */
  decided: number
  /** Runs giving the most common verdict. */
  agreeing: number
  majority: Verdict | null
  /** One entry per full-mode run, oldest first, for the pips. */
  verdicts: (Verdict | null)[]
}

export function agreement(c: CaseEntry): Agreement {
  const full = c.runs.filter((r) => r.runMode === 'full')
  const decided = full.filter((r) => r.verdict && r.status !== 'outage')
  const counts = new Map<Verdict, number>()
  for (const r of decided) counts.set(r.verdict!, (counts.get(r.verdict!) ?? 0) + 1)
  let majority: Verdict | null = null
  let agreeing = 0
  for (const [v, n] of counts) if (n > agreeing) [majority, agreeing] = [v, n]
  return { decided: decided.length, agreeing, majority, verdicts: [...full].reverse().map((r) => r.verdict) }
}

export function latestInv(c: CaseEntry): Investigation | null {
  const r = c.runs[0]
  return r?.load.ok ? r.load.investigation : null
}

export interface SiteStats {
  cases: number
  runs: number
  fullRuns: number
  byLatest: Record<LatestState, number>
  /** Verdicts across all full-mode runs. */
  runVerdicts: Record<Verdict, number>
  consistentCases: number
  casesWithRepeats: number
  reviewed: number
  approved: number
  modelCalls: number
  nemotronCalls: number
  routedModels: Map<string, number>
  medianDurationMs: number | null
  outages: number
  failed: number
  running: number
  lastRunAt: string | null
}

export function siteStats(site: SiteData): SiteStats {
  const byLatest = {} as Record<LatestState, number>
  for (const c of site.cases) {
    const s = latestState(c)
    byLatest[s] = (byLatest[s] ?? 0) + 1
  }
  const rows = allRuns(site)
  const full = rows.filter((r) => r.run.runMode === 'full')
  const runVerdicts = { reproduced_failure: 0, no_failure_observed: 0, inconclusive: 0 } as Record<Verdict, number>
  for (const r of full) if (r.run.verdict && r.run.status !== 'outage') runVerdicts[r.run.verdict] += 1

  let consistentCases = 0
  let casesWithRepeats = 0
  for (const c of site.cases) {
    const a = agreement(c)
    if (a.decided > 1) {
      casesWithRepeats += 1
      if (a.agreeing === a.decided) consistentCases += 1
    }
  }

  let reviewed = 0
  let approved = 0
  let modelCalls = 0
  let nemotronCalls = 0
  const routedModels = new Map<string, number>()
  const durations: number[] = []
  for (const { inv } of rows) {
    if (!inv) continue
    if (inv.review) {
      reviewed += 1
      if (inv.review.outcome === 'approved') approved += 1
    }
    for (const rc of inv.receipts) {
      modelCalls += 1
      const m = rc.routedModel ?? 'not reported'
      routedModels.set(m, (routedModels.get(m) ?? 0) + 1)
      if (rc.routedModel && isNemotron(rc.routedModel)) nemotronCalls += 1
    }
    if (inv.durationMs != null && inv.status === 'complete') durations.push(inv.durationMs)
  }
  durations.sort((a, b) => a - b)

  return {
    cases: site.cases.length,
    runs: rows.length,
    fullRuns: full.length,
    byLatest,
    runVerdicts,
    consistentCases,
    casesWithRepeats,
    reviewed,
    approved,
    modelCalls,
    nemotronCalls,
    routedModels,
    medianDurationMs: durations.length ? durations[Math.floor(durations.length / 2)] : null,
    outages: rows.filter((r) => r.run.status === 'outage').length,
    failed: rows.filter((r) => r.run.status === 'failed').length,
    running: rows.filter((r) => r.run.status === 'running').length,
    lastRunAt: rows[0]?.run.startedAt || null,
  }
}

/** Sources cited anywhere in a run's semantic-layer graph. */
export function citedSources(inv: Investigation): string[] {
  const s = new Set<string>()
  for (const e of inv.chain.edges) for (const r of e.refs) s.add(r.source)
  for (const n of inv.chain.nodes) for (const r of n.refs) s.add(r.source)
  return [...s].filter(Boolean).sort()
}

// ---------- Formatting ----------

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
const DATE_LONG = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZoneName: 'short',
})

export function fmtDate(iso: string | null | undefined, long = false): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return (long ? DATE_LONG : DATE).format(d)
}

export function fmtAgo(ms: number | null | undefined, now = Date.now()): string {
  if (ms == null) return '—'
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${String(s % 60).padStart(2, '0')}s`
}

export function fmtValue(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 3 })
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

export function pct(n: number, d: number): string {
  if (!d) return '—'
  return `${Math.round((n / d) * 100)}%`
}

/** "run-20261026210022-1c1b71" → "1c1b71" */
export function shortRun(runId: string): string {
  return runId.split('-').pop() ?? runId
}

// ---------- Plain language, from the run's own data ----------

const COMPONENTS_LINE = /System components:\s*/i

/** What the change does, in its author's words: the description before any component list. */
export function changeInWords(inv: Investigation): string | null {
  const d = inv.change?.description ?? ''
  const head = d.split(COMPONENTS_LINE)[0].trim()
  return head || null
}

/**
 * What each component does, from the change description's "System components:
 * name (what it does); …" list. Real catalogs would supply the same thing.
 */
export function componentRoles(inv: Investigation): Map<string, string> {
  const roles = new Map<string, string>()
  const d = inv.change?.description ?? ''
  const m = d.split(COMPONENTS_LINE)[1]
  if (!m) return roles
  const line = m.split('\n')[0]
  for (const part of line.split(/;\s*(?![^()]*\))/)) {
    const hit = part.trim().match(/^([\w.:\-/]+)\s*\((.+)\)\.?$/)
    if (hit) roles.set(hit[1], hit[2].trim())
  }
  return roles
}

/** The role for a component name, matching "rule-validator.validate" to "rule-validator". */
export function roleFor(name: string, roles: Map<string, string>): string | null {
  if (roles.has(name)) return roles.get(name)!
  const base = name.split(/[.:]/)[0]
  return roles.get(base) ?? null
}

/** The component that stopped working with the change: a non-zero exit the baseline didn't have. */
export function brokenComponent(inv: Investigation): string | null {
  const cand = inv.experiments.find((x) => x.variant === 'candidate' && x.outcome === 'fail')
  if (!cand) return null
  const base = inv.experiments.find((x) => x.variant === 'baseline' && x.completed)
  for (const [k, v] of Object.entries(cand.observations)) {
    if (!/\.exit_code$/.test(k)) continue
    if (Number(v) !== 0 && base?.observations[k] !== v) return k.replace(/\.exit_code$/, '')
  }
  const failed = cand.assertions.find((a) => !a.passed)?.name
  return failed && failed.includes('.') ? failed.split('.')[0] : null
}

/** Cases from Domino's synthetic test systems, as opposed to a team's own changes. */
export function isExample(kind: string): boolean {
  return kind === 'practice' || kind === 'inspired' || kind === 'held_out' || kind === 'safe'
}

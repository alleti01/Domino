// Which report view a URL asks for, and how to describe a saved run honestly.
// Reports used to be one long page addressed by ?section=<anchor>; they are now
// tabs, and every old anchor still lands on the tab that holds it.

import type { CaseEntry, RunEntry, Verdict } from '../types'

export type ReportTab = 'summary' | 'context' | 'hypotheses' | 'experiments' | 'audit'

export const REPORT_TABS: { id: ReportTab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'context', label: 'Change & context' },
  { id: 'hypotheses', label: 'Hypotheses' },
  { id: 'experiments', label: 'Experiments' },
  { id: 'audit', label: 'Audit trail' },
]

// Anchors from the single-page report, and where each one lives now.
const LEGACY: Record<string, { tab: ReportTab; anchor: string | null }> = {
  change: { tab: 'context', anchor: 'change' },
  chain: { tab: 'context', anchor: 'chain' },
  hypotheses: { tab: 'hypotheses', anchor: null },
  experiments: { tab: 'experiments', anchor: null },
  verdict: { tab: 'summary', anchor: 'verdict' },
  receipts: { tab: 'audit', anchor: 'receipts' },
  trace: { tab: 'audit', anchor: 'trace' },
}

/** ?section= → the tab to show and, for an old anchor, the part of it to reveal. */
export function resolveSection(section: string | null): { tab: ReportTab; anchor: string | null } {
  if (!section) return { tab: 'summary', anchor: null }
  if (REPORT_TABS.some((t) => t.id === section)) return { tab: section as ReportTab, anchor: null }
  return LEGACY[section] ?? { tab: 'summary', anchor: null }
}

/** The audit tab shows either the event timeline or the model receipts. */
export function auditView(section: string | null): 'trace' | 'receipts' {
  return section === 'receipts' ? 'receipts' : 'trace'
}

/** How a saved run reached this page: the site always reads a recording, whatever mode it ran in. */
export function traceOrigin(run: Pick<RunEntry, 'replay' | 'status'>): string {
  const how = run.replay ? 'replayed from an earlier recording' : 'recorded from a live run'
  return run.status === 'running' ? `Saved trace, ${how}; it ends before a verdict` : `Saved trace, ${how}`
}

// ---------- Overview ----------

/** What the latest run of a case shows: its verdict, or why it has none. */
export type LatestState = Verdict | 'incomplete' | 'stopped' | 'failed' | 'outage' | 'unreadable' | 'none'

export function latestState(c: CaseEntry): LatestState {
  const r = c.runs[0]
  if (!r) return 'none'
  if (!r.load.ok) return 'unreadable'
  if (r.verdict) return r.verdict
  if (r.status === 'outage') return 'outage'
  if (r.status === 'failed') return 'failed'
  if (r.status === 'stopped') return 'stopped'
  return 'incomplete'
}

/** Cases matching a free-text query (title, label, ID, change ID) and a latest-state filter. */
export function filterCases(cases: CaseEntry[], query: string, state: LatestState | 'all'): CaseEntry[] {
  const q = query.trim().toLowerCase()
  return cases.filter((c) => {
    if (state !== 'all' && latestState(c) !== state) return false
    if (!q) return true
    const inv = c.runs[0]?.load.ok ? c.runs[0].load.investigation : null
    return [c.label, c.id, c.description, inv?.change?.title, inv?.change?.changeId]
      .filter((s): s is string => !!s)
      .some((s) => s.toLowerCase().includes(q))
  })
}

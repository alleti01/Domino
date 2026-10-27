import { emptyScorecard, sortRuns, toCaseEntry, toInvestigation, toScorecard, type RunFiles } from './adapter'
import { errorMessage } from './errors'
import type { RawCase, RawManifest, RawWatch, RawZetaris, ReceiptLine, TraceEvent } from './format'
import { parseBundle, parseManifest, parseReceipts, parseScorecard, parseSummary, parseTrace, parseZetaris } from './parse'
import type { DataSource } from './sources'
import type { RunEntry, SiteData, Verdict, WatchState } from '../types'

export interface LoadedSite {
  site: SiteData
  /** Raw files per run, kept so previews can replay a partial run. */
  runs: Map<string, { files: RunFiles; caseMeta: RawCase }>
}

const RUN_TRACE = /^runs\/([^/]+)\/trace\.jsonl$/
const WATCH = /^runs\/watch-[^/]+\.json$/

/** "12@abc…" → { number: 12, sha: "abc…" }. */
function prKey(key: string) {
  const [n, sha] = key.split('@')
  const number = Number(n)
  return Number.isFinite(number) ? { number, sha: sha ?? '' } : null
}

function parseWatch(text: string, file: string): WatchState {
  const raw = JSON.parse(text) as Partial<RawWatch>
  if (typeof raw.repo !== 'string') throw new Error(`${file}: no "repo"`)
  return {
    repo: raw.repo,
    updatedAt: raw.updated_at ?? null,
    current: raw.current ? (prKey(raw.current)?.number ?? null) : null,
    queued: (raw.queue ?? []).flatMap((k) => prKey(String(k))?.number ?? []),
    checked: Object.entries(raw.checked ?? {})
      .flatMap(([k, v]) => {
        const pr = prKey(k)
        return pr ? [{ number: pr.number, headSha: pr.sha, at: v.at, verdicts: (v.verdicts ?? []) as Verdict[], runIds: v.run_ids ?? [] }] : []
      })
      .sort((a, b) => b.at.localeCompare(a.at)),
  }
}

async function readOptional<T>(source: DataSource, path: string, parse: (text: string, file: string) => T, warnings: string[]) {
  if (!source.list().includes(path)) return null
  try {
    return parse(await source.readText(path), path)
  } catch (e) {
    warnings.push(errorMessage(e))
    return null
  }
}

/**
 * A case for runs the manifest doesn't mention: named after the pull request
 * it came from, else after the change.
 */
function autoCase(changeId: string, label: string): RawCase {
  return { case_id: `change-${changeId.replace(/[^\w-]+/g, '-')}`, label, kind: 'other', change_ids: [changeId] }
}

/**
 * Loads every run under runs/<run_id>/ and groups runs into cases by change_id.
 * The manifest is optional: it names cases and sets their order. A broken run
 * file only breaks that run.
 */
export async function loadSite(source: DataSource): Promise<LoadedSite> {
  const warnings: string[] = []
  const paths = source.list()
  const manifest: RawManifest | null = paths.includes('manifest.json')
    ? parseManifest(await source.readText('manifest.json'))
    : null
  const isPlaceholder = source.isPlaceholder || manifest?.placeholder === true

  // receipts.jsonl is shared across runs; index it by request ID.
  const receipts = new Map<string, ReceiptLine>()
  for (const path of ['receipts.jsonl', 'runs/receipts.jsonl']) {
    for (const line of (await readOptional(source, path, parseReceipts, warnings)) ?? []) {
      if (line.requestId) receipts.set(line.requestId, line)
    }
  }

  const caseByChange = new Map<string, RawCase>()
  for (const c of manifest?.cases ?? []) for (const id of c.change_ids) caseByChange.set(id, c)
  const autoCases = new Map<string, RawCase>()
  const runsByCase = new Map<string, RunEntry[]>()
  const loaded = new Map<string, { files: RunFiles; caseMeta: RawCase }>()

  const runDirs = paths.flatMap((p) => p.match(RUN_TRACE)?.[1] ?? [])
  await Promise.all(
    runDirs.map(async (dir) => {
      const tracePath = `runs/${dir}/trace.jsonl`
      const summary = await readOptional(source, `runs/${dir}/summary.json`, parseSummary, warnings)
      let caseMeta: RawCase
      let entry: RunEntry
      try {
        const parsed = parseTrace(await source.readText(tracePath), tracePath)
        const files: RunFiles = {
          events: parsed.events,
          summary,
          bundle: await readOptional(source, `runs/${dir}/bundle.json`, parseBundle, warnings),
          receipts,
          parseWarnings: parsed.warnings,
          reportMd: await readOptional(source, `runs/${dir}/report.md`, (t) => t, warnings),
        }
        const start = parsed.events.find((e): e is Extract<TraceEvent, { type: 'run_started' }> => e.type === 'run_started')
        const changeId = start?.change.change_id ?? summary?.change_id ?? 'unknown'
        caseMeta = caseByChange.get(changeId) ?? autoCases.get(changeId) ?? autoCase(changeId, start?.change.source ? `${start.change.source.repo} #${start.change.source.number}` : (start?.change.title ?? changeId))
        if (!caseByChange.has(changeId)) autoCases.set(changeId, caseMeta)
        const inv = toInvestigation(files, { caseId: caseMeta.case_id, label: caseMeta.label, kind: caseMeta.kind, isPlaceholder })
        loaded.set(inv.runId, { files, caseMeta })
        entry = {
          runId: inv.runId,
          startedAt: inv.startedAt ?? '',
          replay: inv.replay,
          runMode: inv.runMode,
          status: inv.status,
          verdict: inv.verdict?.verdict ?? null,
          load: { ok: true, investigation: inv },
        }
      } catch (e) {
        // Still list the run, under its change if summary.json says which one.
        const changeId = summary?.change_id ?? 'unreadable'
        caseMeta = caseByChange.get(changeId) ?? autoCases.get(changeId) ?? autoCase(changeId, `Unreadable runs (${changeId})`)
        if (!caseByChange.has(changeId)) autoCases.set(changeId, caseMeta)
        entry = {
          runId: summary?.run_id ?? dir,
          startedAt: '',
          replay: false,
          runMode: summary?.mode ?? 'full',
          status: 'failed',
          verdict: null,
          load: { ok: false, error: errorMessage(e) },
        }
      }
      runsByCase.set(caseMeta.case_id, [...(runsByCase.get(caseMeta.case_id) ?? []), entry])
    }),
  )

  const rawCases = [...(manifest?.cases ?? []), ...[...autoCases.values()].sort((a, b) => a.label.localeCompare(b.label))]
  const cases = rawCases.map((c) => toCaseEntry(c, runsByCase.get(c.case_id) ?? []))

  const scorecardPath = manifest?.scorecard ?? 'scorecard.json'
  const rawScorecard = await readOptional(source, scorecardPath, parseScorecard, warnings)
  const scorecard = rawScorecard ? toScorecard(rawScorecard, cases, isPlaceholder) : emptyScorecard(isPlaceholder)
  const zetaris: RawZetaris | null = await readOptional(source, manifest?.zetaris ?? 'zetaris.json', parseZetaris, warnings)

  const watches = (
    await Promise.all(paths.filter((p) => WATCH.test(p)).map((p) => readOptional(source, p, parseWatch, warnings)))
  ).filter((w): w is WatchState => !!w)
  const project = { connected: !!source.connected, watches }

  return { site: { isPlaceholder, project, cases, scorecard, zetaris, warnings }, runs: loaded }
}

/** Re-runs the adapter on the first `count` events of each case's latest run. */
export function asRunning(loaded: LoadedSite, count: number): SiteData {
  const cases = loaded.site.cases.map((c) => {
    const runs = c.runs.map((r, i) => {
      const raw = loaded.runs.get(r.runId)
      if (i !== 0 || !raw || !r.load.ok) return r
      const files = { ...raw.files, events: raw.files.events.slice(0, count), summary: null, bundle: null }
      const partial = toInvestigation(files, {
        caseId: c.id,
        label: c.label,
        kind: c.kind,
        isPlaceholder: r.load.investigation.isPlaceholder,
      })
      return { ...r, status: partial.status, verdict: null, load: { ok: true as const, investigation: partial } }
    })
    return { ...c, runs: sortRuns(runs) }
  })
  return { ...loaded.site, cases }
}

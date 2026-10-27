import { useEffect, useMemo, useState } from 'react'
import { errorMessage } from './errors'
import { asRunning, loadSite, type LoadedSite } from './load'
import { agentSamplesSource, defaultSource, fetchListing, liveSource, placeholderSource, type DataSource } from './sources'
import type { SiteData } from '../types'

/** Where the data on screen comes from. */
export interface Connection {
  mode: 'live' | 'bundled' | 'preview'
  /** Folders the dev server reads, e.g. "../samples/ + ../agent/runs/". */
  source: string
  /** When the listing was last checked (ms since epoch); live only. */
  checkedAt: number | null
  /** When the data on screen last changed (ms since epoch). */
  loadedAt: number | null
}

export type SiteState =
  | { status: 'loading'; connection?: Connection }
  | { status: 'error'; message: string; connection?: Connection }
  | { status: 'ready'; site: SiteData; connection?: Connection }

/** Forces a UI state so every screen can be reviewed without a real run. */
export type PreviewState = 'normal' | 'agent-samples' | 'placeholders' | 'running' | 'loading' | 'empty' | 'error'

export const PREVIEW_STATES: { value: PreviewState; label: string }[] = [
  { value: 'normal', label: 'As loaded' },
  { value: 'agent-samples', label: 'Agent sample runs (stub world)' },
  { value: 'placeholders', label: 'Placeholders' },
  { value: 'running', label: 'Run in progress' },
  { value: 'loading', label: 'Loading' },
  { value: 'empty', label: 'No cases' },
  { value: 'error', label: 'Load error' },
]

// Events kept when previewing a run in progress: enough to show the change,
// queries and hypotheses, but no experiments or verdict yet.
const RUNNING_PREVIEW_EVENTS = 12

/** How often the dashboard asks the dev server whether any run file changed. */
const POLL_MS = 4000

/**
 * The live source when the dev server's data API answers (re-made whenever a
 * file changes), else null. Static builds never find the API and stay on the
 * runs bundled at build time.
 */
function useLiveSource(enabled: boolean) {
  const [live, setLive] = useState<{ source: DataSource; version: string; checkedAt: number } | null | undefined>(
    enabled ? undefined : null,
  )
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      const listing = await fetchListing()
      if (stopped) return
      const hasRuns = listing?.files.some((f) => f.path.endsWith('/trace.jsonl'))
      setLive((prev) => {
        if (!listing || !hasRuns) return null
        if (prev && prev.version === listing.version) return { ...prev, checkedAt: Date.now() }
        return { source: liveSource(listing), version: listing.version, checkedAt: Date.now() }
      })
      // No API (static build): stop asking.
      if (listing) timer = setTimeout(tick, POLL_MS)
    }
    tick()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [enabled])
  return live
}

export function useSite(preview: PreviewState): SiteState {
  const live = useLiveSource(preview === 'normal' || preview === 'running')
  // Tagged with the source it came from, so switching sources shows loading
  // until the new data arrives. A live reload keeps the old data on screen.
  const [result, setResult] = useState<
    ({ ok: true; value: LoadedSite } | { ok: false; message: string }) & { source: DataSource; at: number }
  >()

  const source: DataSource | null =
    preview === 'agent-samples'
      ? agentSamplesSource
      : preview === 'placeholders'
        ? placeholderSource
        : live === undefined
          ? null
          : (live?.source ?? defaultSource())

  useEffect(() => {
    if (!source) return
    let cancelled = false
    loadSite(source)
      .then((value) => !cancelled && setResult({ ok: true, value, source, at: Date.now() }))
      .catch((e) => !cancelled && setResult({ ok: false, message: errorMessage(e), source, at: Date.now() }))
    return () => {
      cancelled = true
    }
  }, [source])

  // While a new live version loads, keep showing the previous one.
  const isLive = !!live && source === live.source
  const loaded = result && (result.source === source || (isLive && result.ok)) ? result : undefined

  const connection: Connection | undefined = source
    ? {
        mode: preview !== 'normal' && preview !== 'running' ? 'preview' : isLive ? 'live' : 'bundled',
        source: source.name,
        checkedAt: isLive ? live!.checkedAt : null,
        loadedAt: loaded?.at ?? null,
      }
    : undefined

  return useMemo<SiteState>(() => {
    if (preview === 'loading' || !loaded) return { status: 'loading', connection }
    if (preview === 'error') return { status: 'error', message: 'samples/manifest.json: not valid JSON (preview)', connection }
    if (!loaded.ok) return { status: 'error', message: loaded.message, connection }
    const { site } = loaded.value
    if (preview === 'empty') return { status: 'ready', site: { ...site, cases: [] }, connection }
    if (preview === 'running') return { status: 'ready', site: asRunning(loaded.value, RUNNING_PREVIEW_EVENTS), connection }
    return { status: 'ready', site, connection }
    // connection is derived from the same inputs; its checkedAt alone shouldn't re-render the site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, preview, connection?.mode, connection?.source, connection?.checkedAt])
}

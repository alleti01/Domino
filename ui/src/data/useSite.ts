import { useEffect, useMemo, useState } from 'react'
import { errorMessage } from './errors'
import { loadSite, type LoadedSite } from './load'
import { defaultSource, emptySource, fetchListing, liveSource, type DataSource } from './sources'
import type { SiteData } from '../types'

/** Where the data on screen comes from. */
export interface Connection {
  mode: 'live' | 'bundled'
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

/** How often the dashboard asks the dev server whether any run file changed. */
const POLL_MS = 4000
/** How often in-progress runs are re-checked for having stopped. */
const STALE_CHECK_MS = 60_000

/**
 * The live source when the dev server's data API answers (re-made whenever a
 * file changes), else null. Static builds never find the API and stay on the
 * runs bundled at build time.
 */
function useLiveSource(enabled: boolean, projectOnly: boolean) {
  const [live, setLive] = useState<{ source: DataSource; version: string; checkedAt: number; projectOnly: boolean } | null | undefined>(
    enabled ? undefined : null,
  )
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      const listing = await fetchListing()
      if (stopped) return
      const hasRuns = listing?.files.some((f) => f.path.endsWith('/trace.jsonl') && (!projectOnly || f.from === 'runs'))
      setLive((prev) => {
        // The console stays on a connected project even before its first run.
        const connected = projectOnly && !!listing?.roots.runs
        if (!listing || (!hasRuns && !connected)) return null
        if (prev && prev.version === listing.version && prev.projectOnly === projectOnly) return { ...prev, checkedAt: Date.now() }
        return { source: liveSource(listing, projectOnly), version: listing.version, checkedAt: Date.now(), projectOnly }
      })
      // No API (static build): stop asking.
      if (listing) timer = setTimeout(tick, POLL_MS)
    }
    tick()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [enabled, projectOnly])
  return live
}

/**
 * `site` (landing page): the repo's saved runs plus any live ones.
 * `console`: only runs from a connected project; nothing when none is connected.
 */
export function useSite(scope: 'site' | 'console' = 'site'): SiteState {
  const live = useLiveSource(true, scope === 'console')
  // Tagged with the source it came from, so switching sources shows loading
  // until the new data arrives. A live reload keeps the old data on screen.
  const [result, setResult] = useState<
    ({ ok: true; value: LoadedSite } | { ok: false; message: string }) & { source: DataSource; at: number }
  >()

  const source: DataSource | null = live === undefined ? null : (live?.source ?? (scope === 'console' ? emptySource : defaultSource()))

  // A run whose agent died writes nothing more, so the listing never changes.
  // While any run is still in progress, reload once a minute so it turns
  // "Stopped" once it has been quiet past STALE_MS.
  const [tick, setTick] = useState(0)
  const anyRunning = result?.ok && result.value.site.cases.some((c) => c.runs.some((r) => r.status === 'running'))
  useEffect(() => {
    if (!anyRunning) return
    const t = setInterval(() => setTick((n) => n + 1), STALE_CHECK_MS)
    return () => clearInterval(t)
  }, [anyRunning])

  useEffect(() => {
    if (!source) return
    let cancelled = false
    loadSite(source)
      .then((value) => !cancelled && setResult({ ok: true, value, source, at: Date.now() }))
      .catch((e) => !cancelled && setResult({ ok: false, message: errorMessage(e), source, at: Date.now() }))
    return () => {
      cancelled = true
    }
  }, [source, tick])

  // While a new live version loads, keep showing the previous one.
  const isLive = !!live && source === live.source
  const loaded = result && (result.source === source || (isLive && result.ok)) ? result : undefined

  const connection: Connection | undefined = source
    ? { mode: isLive ? 'live' : 'bundled', source: source.name, checkedAt: isLive ? live!.checkedAt : null, loadedAt: loaded?.at ?? null }
    : undefined

  return useMemo<SiteState>(() => {
    if (!loaded) return { status: 'loading', connection }
    if (!loaded.ok) return { status: 'error', message: loaded.message, connection }
    return { status: 'ready', site: loaded.value.site, connection }
    // connection is derived from the same inputs; its checkedAt alone shouldn't re-render the site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, connection?.mode, connection?.source])
}

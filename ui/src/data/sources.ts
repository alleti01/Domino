// Where the dashboard reads files from. Paths are relative to the source root,
// e.g. "manifest.json" or "runs/<run_id>/trace.jsonl". Sample runs are bundled
// into the build so it works offline, from any folder, with no keys.

import { LoadError } from './errors'
import { placeholderFiles } from './placeholder'

export interface DataSource {
  name: string
  isPlaceholder: boolean
  /** Every file path the source has. */
  list(): string[]
  readText(path: string): Promise<string>
}

type Loaders = Record<string, () => Promise<string>>

function globSource(name: string, prefix: string, files: Loaders): DataSource {
  const byPath = new Map(Object.entries(files).map(([k, load]) => [k.slice(prefix.length), load]))
  return {
    name,
    isPlaceholder: false,
    list: () => [...byPath.keys()],
    async readText(path) {
      const load = byPath.get(path)
      if (!load) throw new LoadError(`${name}${path} not found`)
      return load()
    },
  }
}

/** samples/ at the repo root: the agent's runs/<run_id>/ folders plus optional manifest, scorecard, Zetaris and receipts. */
export const samplesSource = globSource(
  'samples/',
  '../../../samples/',
  import.meta.glob('../../../samples/**/*.{json,jsonl}', { query: '?raw', import: 'default' }) as Loaders,
)

/** Abhi's real contract samples (stub world). Dev builds only. */
export const agentSamplesSource = globSource(
  'fixtures/agent-v0.1/',
  '../../fixtures/agent-v0.1/',
  (import.meta.env.DEV
    ? import.meta.glob('../../fixtures/agent-v0.1/**/*.{json,jsonl}', { query: '?raw', import: 'default' })
    : {}) as Loaders,
)

export const placeholderSource: DataSource = {
  name: 'built-in placeholders/',
  isPlaceholder: true,
  list: () => [...placeholderFiles().keys()],
  async readText(path) {
    const text = placeholderFiles().get(path)
    if (text == null) throw new LoadError(`placeholder ${path} not found`)
    return text
  },
}

/** Real samples once the agent has written any run, placeholders until then. */
export function defaultSource(): DataSource {
  return samplesSource.list().some((p) => p.endsWith('/trace.jsonl')) ? samplesSource : placeholderSource
}

// ---------- Live: the dev server's data API (see vite.config.ts) ----------

export interface LiveListing {
  version: string
  roots: { samples: string; runs: string | null }
  files: { path: string; size: number; mtimeMs: number }[]
}

/** The dev server's file listing, or null when there is no API (static build) or it is unreachable. */
export async function fetchListing(signal?: AbortSignal): Promise<LiveListing | null> {
  try {
    const res = await fetch('api/domino/files', { cache: 'no-store', signal })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null
    const body = (await res.json()) as LiveListing
    return Array.isArray(body.files) ? body : null
  } catch {
    return null
  }
}

/** Files served live by the dev server, read on demand. */
export function liveSource(listing: LiveListing): DataSource {
  const paths = listing.files.map((f) => f.path)
  return {
    name: [listing.roots.samples, listing.roots.runs]
      .filter((r): r is string => !!r)
      .map((r) => `${r.split('/').slice(-2).join('/')}/`)
      .join(' + '),
    isPlaceholder: false,
    list: () => paths,
    async readText(path) {
      const res = await fetch(`api/domino/file?path=${encodeURIComponent(path)}`, { cache: 'no-store' })
      if (!res.ok) throw new LoadError(`${path}: HTTP ${res.status}`)
      return res.text()
    },
  }
}

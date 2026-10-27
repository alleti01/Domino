import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join, relative, resolve, sep } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/**
 * Live data API for the dashboard (dev server and `vite preview` only).
 *
 *   GET api/domino/files          → { version, roots, files: [{ path, size, mtimeMs }] }
 *   GET api/domino/file?path=…    → the file's text
 *
 * Serves ../samples (manifest, frozen runs) and, when DOMINO_RUNS_DIR is set,
 * every top-level runs/<run_id>/ folder the agent writes there, e.g.
 *   DOMINO_RUNS_DIR=../agent/runs npm run dev
 * The dashboard polls the listing and reloads when a file changes, so a run
 * the agent is writing shows up while it is still in progress. A static build
 * has no API and falls back to the runs bundled at build time.
 */
function dominoApi(): Plugin {
  const samplesDir = resolve(__dirname, '../samples')
  const runsDir = process.env.DOMINO_RUNS_DIR ? resolve(process.cwd(), process.env.DOMINO_RUNS_DIR) : null
  const RUN_FILES = new Set(['trace.jsonl', 'summary.json', 'bundle.json'])

  /** Published path → absolute path on disk. */
  function index(): Map<string, string> {
    const out = new Map<string, string>()
    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, ent.name)
        if (ent.isDirectory()) walk(abs)
        else if (/\.(json|jsonl)$/.test(ent.name)) out.set(relative(samplesDir, abs).split(sep).join('/'), abs)
      }
    }
    if (existsSync(samplesDir)) walk(samplesDir)
    if (runsDir && existsSync(runsDir)) {
      for (const ent of readdirSync(runsDir, { withFileTypes: true })) {
        if (!ent.isDirectory() || !ent.name.startsWith('run-')) continue
        for (const f of RUN_FILES) {
          const abs = join(runsDir, ent.name, f)
          const path = `runs/${ent.name}/${f}`
          if (!out.has(path) && existsSync(abs)) out.set(path, abs)
        }
      }
    }
    return out
  }

  const send = (res: ServerResponse, status: number, body: string, type = 'application/json') => {
    res.statusCode = status
    res.setHeader('Content-Type', `${type}; charset=utf-8`)
    res.setHeader('Cache-Control', 'no-store')
    res.end(body)
  }

  const handle = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.endsWith('/api/domino/files') && !url.pathname.endsWith('/api/domino/file')) return next()
    try {
      const files = index()
      if (url.pathname.endsWith('/files')) {
        const list = [...files].map(([path, abs]) => {
          const st = statSync(abs)
          return { path, size: st.size, mtimeMs: Math.round(st.mtimeMs) }
        })
        const version = createHash('sha1')
          .update(list.map((f) => `${f.path}:${f.size}:${f.mtimeMs}`).join('\n'))
          .digest('hex')
          .slice(0, 12)
        const roots = { samples: relative(process.cwd(), samplesDir), runs: runsDir ? relative(process.cwd(), runsDir) : null }
        return send(res, 200, JSON.stringify({ version, roots, files: list }))
      }
      const abs = files.get(url.searchParams.get('path') ?? '')
      if (!abs) return send(res, 404, JSON.stringify({ error: 'not found' }))
      return send(res, 200, readFileSync(abs, 'utf8'), 'text/plain')
    } catch (e) {
      return send(res, 500, JSON.stringify({ error: String(e) }))
    }
  }

  return {
    name: 'domino-api',
    configureServer: (server) => void server.middlewares.use(handle),
    configurePreviewServer: (server) => void server.middlewares.use(handle),
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the built dashboard opens from any folder or static host.
  base: './',
  plugins: [react(), dominoApi()],
  // Sample traces live in ../samples and are bundled in at build time.
  server: { fs: { allow: ['..'] } },
  // The landing page's 3D scene (three.js) is one lazily loaded chunk of ~930 kB
  // (~250 kB gzipped); nothing else waits on it.
  build: { chunkSizeWarningLimit: 1000 },
})

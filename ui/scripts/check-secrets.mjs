#!/usr/bin/env node
// Scans files for anything that looks like a credential before it's committed
// or bundled into the dashboard. Usage: node scripts/check-secrets.mjs <dir|file>...
// Exits 1 and prints file:line (with the match redacted) if it finds something.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const PATTERNS = [
  ['NVIDIA API key', /nvapi-[A-Za-z0-9_-]{20,}/],
  ['OpenAI-style key', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['Bearer token', /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i],
  ['Secret-named field', /"(api[_-]?key|access[_-]?token|auth[_-]?token|runtime[_-]?token|secret|password|passwd)"\s*:\s*"[^"]{8,}"/i],
  ['Connection string with password', /\b[a-z]+:\/\/[^\s:/@"']+:[^\s@"']{4,}@/i],
]
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist'])
const EXTENSIONS = /\.(json|jsonl|md|txt|ts|tsx|js|mjs|html|css|env|ya?ml|csv)$/i

function* walk(path) {
  if (!existsSync(path)) return
  const st = statSync(path)
  if (st.isFile()) {
    if (EXTENSIONS.test(path) || path.includes('.env')) yield path
    return
  }
  for (const name of readdirSync(path)) {
    if (SKIP_DIRS.has(name)) continue
    yield* walk(join(path, name))
  }
}

const targets = process.argv.slice(2)
if (targets.length === 0) {
  console.error('usage: check-secrets.mjs <dir|file>...')
  process.exit(2)
}

const findings = []
let scanned = 0
for (const target of targets) {
  for (const file of walk(target)) {
    if (file.endsWith('.env.example')) continue
    scanned += 1
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const [name, re] of PATTERNS) {
          const m = line.match(re)
          if (m) findings.push(`${relative(process.cwd(), file)}:${i + 1}  ${name}: ${m[0].slice(0, 6)}…[redacted]`)
        }
      })
  }
}

if (findings.length) {
  console.error(`Possible secrets found (${findings.length}). Remove them before committing or building:`)
  for (const f of findings) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`No secrets found in ${scanned} files (${targets.join(', ')}).`)

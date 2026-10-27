// "How it breaks": the verdict's path drawn as a short animated flow, from the
// commit to the component that stopped, then three plain answers underneath:
// what was committed, what broke, how it could be fixed. Every name, number
// and link comes from the run; only the arrangement is illustrative.

import { FIX, fixLine, fixStatus } from '../../fix'
import { useState } from 'react'
import { href } from '../../../lib/router'
import { chainTiles, experimentSummary } from '../../../lib/showcase'
import type { Investigation } from '../../../types'
import { brokenComponent, componentRoles, fmtValue, roleFor } from '../../derive'
import { DIcon } from '../../icons'
import { humanize, Tag } from '../../ui'
import { kindWord, relationWords } from '../../words'

interface Step {
  id: string
  name: string
  kind: string
  role: string | null
  /** The link into this step from the previous one. */
  via: { words: string; raw: string; inferred: boolean } | null
  state: 'change' | 'pass' | 'broken' | 'limit'
  badge: string | null
}

/** What a step is: its own description, or for a setting, whose setting it is. */
function stepRole(name: string, kind: string, roles: Map<string, string>): string | null {
  if (roles.has(name)) return roles.get(name)!
  const owner = name.split(/[.:]/)[0]
  if (kind === 'setting' || kind === 'limit') return owner !== name && roles.has(owner) ? `Setting of ${owner}` : null
  return roleFor(name, roles)
}

function diffStats(diff: string) {
  let add = 0
  let del = 0
  for (const l of diff.split('\n')) {
    if (l.startsWith('+') && !l.startsWith('+++')) add += 1
    else if (l.startsWith('-') && !l.startsWith('---')) del += 1
  }
  return { add, del }
}

function firstSentence(text: string, max = 180) {
  const s = text.split(/(?<=[.!?])\s+/)[0] ?? text
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

export function buildFlow(inv: Investigation): Step[] {
  const tiles = chainTiles(inv)
  if (tiles.length < 2) return []
  const roles = componentRoles(inv)
  const x = experimentSummary(inv)
  const breaks = inv.verdict?.verdict === 'reproduced_failure'
  const comp = breaks ? brokenComponent(inv) : null
  const cand = inv.experiments.find((e) => e.variant === 'candidate' && e.outcome === 'fail')
  const exit = comp ? cand?.observations[`${comp}.exit_code`] : undefined
  const stopBadge = exit != null ? `Stops · exit ${fmtValue(exit)}` : 'Fails'

  const steps: Step[] = tiles.map((t) => ({
    id: t.id,
    name: t.kind === 'change' ? 'The change' : t.label,
    kind: t.kind,
    role: t.kind === 'change' ? (inv.change?.files.length ? inv.change.files.map((f) => f.split('/').pop()).join(', ') : null) : stepRole(t.label, t.kind, roles),
    via: t.link ? { words: relationWords(t.link.relation), raw: t.link.relation, inferred: t.link.status !== 'observed' } : null,
    state: t.kind === 'change' ? 'change' : 'pass',
    badge: null,
  }))

  // The stated limit, where the path runs into it.
  if (x?.limit?.value != null) {
    const s = steps.find((st) => st.name === x.limit!.name)
    if (s) [s.state, s.badge] = ['limit', `Limit ${fmtValue(x.limit.value)}`]
  }
  // What stopped: on the path if it's there, else added at the end as what the sandbox showed.
  if (comp) {
    const s = steps.find((st) => st.name === comp && st.state === 'pass')
    if (s) [s.state, s.badge] = ['broken', stopBadge]
    else
      steps.push({
        id: `broken:${comp}`,
        name: comp,
        kind: 'service',
        role: roleFor(comp, roles),
        via: { words: 'fails in the sandbox', raw: 'observed in the experiments', inferred: false },
        state: 'broken',
        badge: stopBadge,
      })
  }
  return steps
}

/** Seconds into the animation that step i appears. */
const at = (i: number) => 0.15 + i * 0.42

export function Flow({ inv, runParam }: { inv: Investigation; runParam: string | null }) {
  const [play, setPlay] = useState(0)
  const steps = buildFlow(inv)
  if (steps.length === 0) return null

  const breaks = inv.verdict?.verdict === 'reproduced_failure'
  const broken = steps.find((s) => s.state === 'broken')
  const x = experimentSummary(inv)
  const check = x?.failure ? humanize(x.failure.split(':')[0]).name.toLowerCase() : null
  const observed = x?.failure?.includes(':') ? x.failure.split(':').slice(1).join(':').trim() : null
  const c = inv.change
  const stats = c?.diff ? diffStats(c.diff) : null
  const done = at(steps.length) + 0.3

  return (
    <section className="dx-panel dx-flow-panel" aria-labelledby="dx-flow-title">
      <div className="dx-panel-h">
        <h2 id="dx-flow-title">{breaks ? 'How it breaks' : 'What the change reaches'}</h2>
        <div className="dx-panel-h-end">
          <button type="button" className="dx-btn dx-btn-sm dx-btn-ghost" onClick={() => setPlay((p) => p + 1)}>
            <DIcon name="play" size={12} /> Replay
          </button>
          <a className="dx-link" href={href.case(inv.caseId, { runId: runParam, section: 'evidence' })}>
            Dependency map
          </a>
        </div>
      </div>

      <div className="dx-flow-body" key={play}>
        <ol className="dx-path" aria-label="Path from the change to the failure">
          {steps.map((s, i) => (
            <li
              key={s.id}
              className={`dx-path-step is-${s.state}${s.via?.inferred ? ' via-inferred' : ''}`}
              style={{ ['--d' as string]: `${at(i)}s` }}
            >
              {s.via && (
                <span className="dx-path-via" title={s.via.raw}>
                  {s.via.words}
                </span>
              )}
              <span className="dx-path-row" title={s.role ? `${kindWord(s.kind)} · ${s.role}` : kindWord(s.kind)}>
                <span className="dx-path-mark" aria-hidden="true">
                  {s.state === 'broken' ? <DIcon name="x" size={11} /> : null}
                </span>
                <span className="dx-path-name">{s.name}</span>
                {s.state === 'change' && s.role && <span className="dx-path-note">{s.role}</span>}
                {s.badge && <span className="dx-path-note">{s.badge.replace('Stops · ', 'stops, ')}</span>}
              </span>
            </li>
          ))}
        </ol>

        <div className="dx-flow-sum" style={{ ['--d' as string]: `${done}s` }}>
        <div>
          <span className="dx-sum-label">What was committed</span>
          {c ? (
            <>
              <p>{firstSentence(c.description.split(/System components:/i)[0].trim() || c.title)}</p>
              <p className="dx-faint">
                {c.files.length === 1 ? c.files[0] : `${c.files.length} files`}
                {stats && (
                  <>
                    {' · '}
                    <span className="dx-add">+{stats.add}</span> <span className="dx-del">−{stats.del}</span>
                  </>
                )}
              </p>
            </>
          ) : (
            <p className="dx-faint">Not recorded</p>
          )}
        </div>
        <div>
          <span className="dx-sum-label">{breaks ? 'What breaks' : 'Result'}</span>
          {breaks ? (
            <>
              <p>
                <b>{broken?.name ?? 'A downstream component'}</b>
                {broken?.role ? `, which ${broken.role.replace(/\.$/, '')},` : ''} {check ? <>fails the check “{check}”</> : 'fails'}.
              </p>
              {observed && <p className="dx-faint">{observed}</p>}
            </>
          ) : (
            <p>Every check passed with the change, as it did without it.</p>
          )}
        </div>
        <div>
          <span className="dx-sum-label">How to fix</span>
          {inv.verdict?.mitigation ? (
            <>
              <p>{firstSentence(inv.verdict.mitigation)}</p>
              <p className="dx-row" style={{ gap: 6 }}>
                <Tag tone={FIX[fixStatus(inv)].tone}>{fixLine(inv)}</Tag>
                <span className="dx-faint">full suggestion below</span>
              </p>
            </>
          ) : (
            <p className="dx-faint">{breaks ? 'No fix was suggested in this run.' : 'Nothing to fix under these tests.'}</p>
          )}
        </div>
      </div>
      </div>
    </section>
  )
}

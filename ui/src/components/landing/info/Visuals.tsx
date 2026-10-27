// Drawn visuals for the info pages and the top nav. Nothing here is a
// screenshot: each one is laid out from the recorded runs (InfoFacts), in the
// console's card style, with a little motion where something moves for real
// (calls going out, rows flowing into the semantic layer).

import type { CSSProperties, ReactNode } from 'react'
import meterlessLogo from '../../../assets/logos/meterless.svg'
import nvidiaMark from '../../../assets/logos/nvidia-mark.svg'
import zetarisMark from '../../../assets/logos/zetaris-mark.svg'
import { DIcon, type DIconName } from '../../../dash/icons'
import { LogoMark } from '../../LogoMark'
import { secs, type InfoFacts } from './facts'

export type Brand = 'zetaris' | 'nvidia' | 'meterless'

/** A sponsor's own mark, filling its tile. NVIDIA's eye sits on a white tile. */
export function BrandTile({ brand, size = 40 }: { brand: Brand; size?: number }) {
  const st = { '--s': `${size}px` } as CSSProperties
  if (brand === 'nvidia')
    return (
      <span className="v-bt is-nv" style={st}>
        <img src={nvidiaMark} alt="" />
      </span>
    )
  return <img className="v-bt" style={st} src={brand === 'zetaris' ? zetarisMark : meterlessLogo} alt="" />
}

/** An icon on a tile, the same size as a brand tile. */
export function IconTile({ name, size = 40 }: { name: DIconName; size?: number }) {
  return (
    <span className="v-it" style={{ '--s': `${size}px` } as CSSProperties}>
      <DIcon name={name} size={Math.round(size * 0.48)} />
    </span>
  )
}

function DominoTile({ size = 60 }: { size?: number }) {
  return (
    <span className="v-dom" style={{ '--s': `${size}px` } as CSSProperties}>
      <LogoMark size={Math.round(size * 0.5)} />
    </span>
  )
}

function Card({ label, right, children, className = '' }: { label: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`vx-card ${className}`}>
      <div className="vx-card-h">
        <span>{label}</span>
        {right}
      </div>
      {children}
    </div>
  )
}

const Live = ({ children }: { children: ReactNode }) => (
  <span className="v-live">
    <i />
    {children}
  </span>
)

// ---------------------------------------------------------------------------
// Sponsors: Domino in the middle, the four sponsors around it, calls running
// along the lines between them.

const HUB = [
  { brand: 'zetaris' as Brand, name: 'Zetaris', x: 78, y: 62 },
  { brand: 'nvidia' as Brand, name: 'NVIDIA Nemotron', x: 322, y: 62 },
  { brand: 'meterless' as Brand, name: 'Nightshift', x: 78, y: 188 },
  { brand: 'meterless' as Brand, name: 'World Model', x: 322, y: 188 },
]

export function HubVisual({ facts, compact = false }: { facts: InfoFacts | null; compact?: boolean }) {
  const f = facts
  const chips = [
    f ? `${f.queries} queries` : null,
    f ? `${f.site.nemotronCalls} calls` : null,
    f ? `${f.site.answeredCalls} receipts` : null,
    f ? `${f.memory.total} reads & writes` : null,
  ]
  const path = (x: number, y: number) => `M200 125 C ${x < 200 ? 150 : 250} 125, ${x < 200 ? x + 50 : x - 50} ${y}, ${x} ${y}`
  return (
    <div className={`v-hub${compact ? ' is-compact' : ''}`}>
      <svg viewBox="0 0 400 250" preserveAspectRatio="none" aria-hidden="true">
        {HUB.map((h, k) => (
          <g key={k}>
            <path d={path(h.x, h.y)} className="v-hub-line" />
            <circle r="3" className="v-hub-dot">
              <animateMotion dur="2.6s" begin={`${k * 0.65}s`} repeatCount="indefinite" path={path(h.x, h.y)} />
            </circle>
          </g>
        ))}
      </svg>
      <span className="v-hub-center">
        <DominoTile size={compact ? 52 : 64} />
        <span className="v-pulse" />
      </span>
      {HUB.map((h, k) => (
        <span key={k} className="v-hub-node" style={{ left: `${(h.x / 400) * 100}%`, top: `${(h.y / 250) * 100}%` }}>
          <BrandTile brand={h.brand} size={compact ? 34 : 44} />
          <b>{h.name}</b>
          {!compact && chips[k] && <small>{chips[k]}</small>}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Method: one change, three sandbox runs, against the limit.

export function RunsVisual({ facts, compact = false }: { facts: InfoFacts | null; compact?: boolean }) {
  const r = facts?.runs ?? { measure: 'records read', without: 140, with: 280, undone: 140, limit: { name: 'limit', value: 200 }, broke: null, failed: true, check: null, detail: null }
  const top = Math.max(r.with, r.without, r.undone ?? 0, r.limit?.value ?? 0) * 1.18
  const bars = [
    { label: 'Without', v: r.without, bad: false },
    { label: 'With the change', v: r.with, bad: r.failed },
    { label: 'Undone', v: r.undone, bad: false },
  ]
  return (
    <Card
      className={`v-runs${compact ? ' is-compact' : ''}`}
      label="Three sandbox runs"
      right={r.failed ? <span className="v-tag is-bad">Breaks</span> : <span className="v-tag">No failure</span>}
    >
      <div className="v-runs-plot">
        {r.limit && (
          <em className="v-runs-limit" style={{ bottom: `${(r.limit.value / top) * 100}%` }}>
            <span>limit {r.limit.value}</span>
          </em>
        )}
        {bars.map((b, k) =>
          b.v == null ? null : (
            <div key={b.label} className="v-runs-col">
              <span className={`v-runs-bar${b.bad ? ' is-bad' : ''}`} style={{ height: `${(b.v / top) * 100}%`, '--d': `${k * 120}ms` } as CSSProperties}>
                <b>{b.v}</b>
              </span>
            </div>
          ),
        )}
      </div>
      <div className="v-runs-x">
        {bars.map((b) => (
          <span key={b.label}>{b.label}</span>
        ))}
      </div>
      {!compact && <p className="v-cap">{cap(r.measure)}</p>}
    </Card>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ---------------------------------------------------------------------------
// About / Track 1: separate sources, joined into one layer Domino can read.

export function LayersVisual({ facts, compact = false }: { facts: InfoFacts | null; compact?: boolean }) {
  const src = (facts?.sources ?? []).slice(0, 5)
  const list = src.length ? src : ['change log', 'code repository', 'service settings', 'service catalog', 'database permissions'].map((name) => ({ name, uses: 0 }))
  const ys = list.map((_, k) => 30 + (k * 190) / Math.max(1, list.length - 1))
  return (
    <div className={`v-layers${compact ? ' is-compact' : ''}`}>
      <svg viewBox="0 0 400 250" preserveAspectRatio="none" aria-hidden="true">
        {ys.map((y, k) => {
          const d = `M118 ${y} C 170 ${y}, 170 125, 222 125`
          return (
            <g key={k}>
              <path d={d} className="v-hub-line" />
              <circle r="2.6" className="v-hub-dot">
                <animateMotion dur="2.2s" begin={`${k * 0.4}s`} repeatCount="indefinite" path={d} />
              </circle>
            </g>
          )
        })}
        <path d="M318 125 L356 125" className="v-hub-line" />
      </svg>
      <ul className="v-layers-src">
        {list.map((s, k) => (
          <li key={s.name} style={{ top: `${(ys[k] / 250) * 100}%` }}>
            <i />
            {s.name}
            {!compact && s.uses > 0 && <small>{s.uses}</small>}
          </li>
        ))}
      </ul>
      <div className="v-stack">
        <span />
        <span />
        <span>
          <img src={zetarisMark} alt="" />
        </span>
      </div>
      <span className="v-layers-dom">
        <DominoTile size={compact ? 42 : 52} />
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Docs: what a check leaves on the pull request.

export function PrCheckVisual({ facts, compact = false }: { facts: InfoFacts | null; compact?: boolean }) {
  const r = facts?.runs
  return (
    <Card className={`v-pr${compact ? ' is-compact' : ''}`} label="Pull request check" right={<Live>domino</Live>}>
      <div className="v-pr-title">
        <span className={`v-pr-x${r?.failed === false ? ' is-ok' : ''}`}>
          <DIcon name={r?.failed === false ? 'check' : 'x'} size={12} />
        </span>
        <b>{r?.broke ? `This change breaks ${r.broke}` : 'This change breaks something'}</b>
      </div>
      {!compact && <p className="v-pr-change">{facts?.change ?? 'A proposed change'}</p>}
      {r && (
        <div className="v-pr-grid">
          <span>
            <small>Without</small>
            {r.without}
          </span>
          <span className={r.failed ? 'is-bad' : undefined}>
            <small>With</small>
            {r.with}
          </span>
          <span>
            <small>Undone</small>
            {r.undone ?? '–'}
          </span>
          <span>
            <small>Limit</small>
            {r.limit?.value ?? '–'}
          </span>
        </div>
      )}
      {!compact && (
        <p className="v-pr-foot">
          <code>$ domino pr 42 --repo owner/name</code>
        </p>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Mini interfaces for the sponsor rows.

export function SourcesUI({ facts }: { facts: InfoFacts | null }) {
  const rows = (facts?.sources ?? []).slice(0, 5)
  const max = Math.max(1, ...rows.map((r) => r.uses))
  return (
    <Card label="Semantic layer · sources cited" right={<Live>read-only</Live>}>
      <ul className="v-rows">
        {rows.map((r, k) => (
          <li key={r.name}>
            <span className="v-rows-name">{r.name}</span>
            <span className="v-meter">
              <i style={{ width: `${(r.uses / max) * 100}%`, '--d': `${k * 80}ms` } as CSSProperties} />
            </span>
            <span className="v-rows-n">{r.uses}</span>
          </li>
        ))}
      </ul>
      <p className="v-cap">Times each source was cited as evidence, across all runs.</p>
    </Card>
  )
}

export function ModelsUI({ facts }: { facts: InfoFacts | null }) {
  const rows = (facts?.models ?? []).slice(0, 2)
  const max = Math.max(1, ...rows.map((r) => r.calls))
  return (
    <Card label="Models that answered" right={<Live>via Nightshift</Live>}>
      <ul className="v-models">
        {rows.map((m, k) => (
          <li key={m.id}>
            <div className="v-models-top">
              <BrandTile brand="nvidia" size={28} />
              <span>
                <b>{m.name}</b>
                <small>{m.reviewer || k === 1 ? 'Reviewer · checks the explanation' : 'Investigator · runs the check'}</small>
              </span>
              <em>{m.calls}</em>
            </div>
            <span className="v-meter">
              <i style={{ width: `${(m.calls / max) * 100}%`, '--d': `${k * 120}ms` } as CSSProperties} />
            </span>
            <small className="v-models-ms">median {secs(m.medianMs)} per call</small>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function ReceiptsUI({ facts }: { facts: InfoFacts | null }) {
  const rows = facts?.receipts ?? []
  return (
    <Card label="Nightshift · receipts" right={<span className="v-tag">{facts ? `${facts.site.answeredCalls} total` : ''}</span>}>
      <ul className="v-rcpt">
        {rows.map((r, k) => (
          <li key={k} style={{ '--d': `${k * 90}ms` } as CSSProperties}>
            <span className="v-rcpt-step">{r.step}</span>
            <span className="v-rcpt-model">{r.model}</span>
            <span className="v-rcpt-ms">{secs(r.ms)}</span>
            <span className={`v-tag${r.ok ? ' is-ok' : ' is-bad'}`}>{r.ok ? 'ok' : 'failed'}</span>
          </li>
        ))}
      </ul>
      <p className="v-cap">The first calls of one recorded check. Each receipt names the model that answered.</p>
    </Card>
  )
}

export function MemoryUI({ facts }: { facts: InfoFacts | null }) {
  const m = facts?.memory ?? { write: 0, update: 0, read: 0, total: 0 }
  const chain = ['Path found', 'Guess', 'Experiment', 'Cause chain']
  return (
    <Card label="World Model · one investigation" right={<Live>with sources</Live>}>
      <div className="v-mem-n">
        <span>
          <b>{m.write}</b>
          <small>Writes</small>
        </span>
        <span>
          <b>{m.update}</b>
          <small>Updates</small>
        </span>
        <span>
          <b>{m.read}</b>
          <small>Reads</small>
        </span>
      </div>
      <ol className="v-chain">
        {chain.map((c, k) => (
          <li key={c} style={{ '--d': `${k * 140}ms` } as CSSProperties}>
            <i />
            {c}
          </li>
        ))}
      </ol>
      <p className="v-cap">The verdict’s cause chain is built by walking what was written.</p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Method: the check end to end, and the four limits.

const FLOW: { label: string; icon: DIconName; brand?: Brand; who?: string }[] = [
  { label: 'Read the change', icon: 'pr' },
  { label: 'Ask the semantic layer', icon: 'data', brand: 'zetaris', who: 'Zetaris' },
  { label: 'Guess what could break', icon: 'hypothesis', brand: 'nvidia', who: 'Nemotron' },
  { label: 'Pick the test', icon: 'memory', brand: 'meterless', who: 'World Model' },
  { label: 'Run it in a sandbox', icon: 'flask' },
  { label: 'Undo the change', icon: 'restart' },
  { label: 'Give the verdict', icon: 'check', brand: 'nvidia', who: 'Reviewed by Ultra' },
]

export function FlowDiagram() {
  return (
    <div className="v-flow">
      <span className="v-flow-track" aria-hidden="true">
        <i />
      </span>
      <ol>
        {FLOW.map((s, k) => (
          <li key={s.label} style={{ '--d': `${k * 90}ms` } as CSSProperties}>
            <span className="v-flow-n">0{k + 1}</span>
            <IconTile name={s.icon} size={44} />
            <b>{s.label}</b>
            {s.brand ? (
              <span className="v-flow-who">
                <BrandTile brand={s.brand} size={16} />
                {s.who}
              </span>
            ) : (
              <span className="v-flow-who is-empty">Domino</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

export function AssertUI({ facts }: { facts: InfoFacts | null }) {
  const r = facts?.runs
  return (
    <Card label="Fixed checks · with the change">
      <ul className="v-asserts">
        <li>
          <span className="v-tag is-ok">pass</span>
          <span>build finishes</span>
        </li>
        <li>
          <span className={`v-tag${r?.failed === false ? ' is-ok' : ' is-bad'}`}>{r?.failed === false ? 'pass' : 'fail'}</span>
          <span>
            {r?.check ?? 'runtime starts'}
            {r?.detail && <small>{r.detail}</small>}
          </span>
        </li>
      </ul>
      <p className="v-cap">Code reads these. The model can’t change them.</p>
    </Card>
  )
}

export function GatewayUI() {
  const tools = ['lookup', 'dependency_path', 'run_experiment', 'describe_world']
  return (
    <Card label="Tool gateway · allowed calls">
      <ul className="v-gate">
        {tools.map((t) => (
          <li key={t}>
            <DIcon name="check" size={12} />
            <code>{t}()</code>
          </li>
        ))}
        <li className="is-no">
          <DIcon name="x" size={12} />
          <code>shell</code>
          <small>blocked</small>
        </li>
      </ul>
    </Card>
  )
}

export function AccessUI() {
  return (
    <Card label="Semantic layer · login">
      <div className="v-access">
        <span className="v-access-key">
          <DIcon name="shield" size={18} />
        </span>
        <span>
          <b>Domino agent</b>
          <small>non-admin · read-only</small>
        </span>
      </div>
      <ul className="v-gate">
        <li>
          <DIcon name="check" size={12} /> <code>read</code> <small>semantic layer</small>
        </li>
        <li>
          <DIcon name="check" size={12} /> <code>write</code> <small>throwaway sandbox only</small>
        </li>
      </ul>
    </Card>
  )
}

export function TwoSourceUI({ facts }: { facts: InfoFacts | null }) {
  const s = (facts?.sources ?? []).slice(0, 2).map((x) => x.name)
  const [a, b] = s.length === 2 ? s : ['change log', 'service settings']
  return (
    <Card label="One reported risk">
      <div className="v-two">
        <span className="v-two-src">{a}</span>
        <span className="v-two-src">{b}</span>
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
          <path d="M25 0 C25 22, 50 18, 50 40 M75 0 C75 22, 50 18, 50 40" className="v-hub-line" />
        </svg>
        <span className="v-two-fact">
          A limit the change goes past <span className="v-tag is-ok">observed</span>
        </span>
      </div>
    </Card>
  )
}

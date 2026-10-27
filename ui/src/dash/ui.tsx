// Console primitives. Pages compose these; nothing here knows about Domino's data
// beyond verdict wording, which comes only from lib/labels.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { VERDICT, type Tone } from '../lib/labels'
import type { LatestState } from '../lib/report'
import { useLocation, withEvidence } from '../lib/router'
import type { SourceRef, Verdict } from '../types'
import { DIcon, type DIconName } from './icons'

export function Status({ tone, children, pulse }: { tone: Tone; children: ReactNode; pulse?: boolean }) {
  return (
    <span className={`dx-status tone-${tone}`}>
      <span className={`dx-dot${pulse ? ' is-pulse' : ''}`} aria-hidden="true" />
      {children}
    </span>
  )
}

export function Tag({ tone, mono, children, title }: { tone?: Tone; mono?: boolean; children: ReactNode; title?: string }) {
  return (
    <span className={`dx-tag${tone ? ` tone-${tone}` : ''}${mono ? ' dx-tag-mono' : ''}`} title={title}>
      {children}
    </span>
  )
}

/** Short verdict labels for dense tables; the full wording is the tooltip and appears on the report. */
export const VERDICT_SHORT: Record<Verdict, string> = {
  reproduced_failure: 'Reproduced failure',
  no_failure_observed: 'No failure observed',
  inconclusive: 'Inconclusive',
}

export function VerdictStatus({ verdict, short }: { verdict: Verdict; short?: boolean }) {
  const v = VERDICT[verdict]
  return (
    <span title={v.label}>
      <Status tone={v.tone}>{short ? VERDICT_SHORT[verdict] : v.label}</Status>
    </span>
  )
}

const STATE_LABEL: Record<Exclude<LatestState, Verdict>, { label: string; tone: Tone }> = {
  incomplete: { label: 'In progress', tone: 'accent' },
  failed: { label: 'Run failed', tone: 'fail' },
  outage: { label: 'Outage', tone: 'warn' },
  unreadable: { label: 'Unreadable', tone: 'fail' },
  none: { label: 'No runs', tone: 'muted' },
}

export function StateStatus({ state, short = true }: { state: LatestState; short?: boolean }) {
  if (state in VERDICT) return <VerdictStatus verdict={state as Verdict} short={short} />
  const s = STATE_LABEL[state as Exclude<LatestState, Verdict>]
  return (
    <Status tone={s.tone} pulse={state === 'incomplete'}>
      {s.label}
    </Status>
  )
}

/** Link evidence strength: observed = two sources agree. */
export const LINK_TONE = { observed: 'ok', inferred: 'warn', unresolved: 'fail' } as const

export function verdictTone(v: Verdict | null | undefined): Tone {
  return v ? VERDICT[v].tone : 'muted'
}

export function Pips({ verdicts }: { verdicts: (Verdict | null)[] }) {
  return (
    <span className="dx-pips" aria-hidden="true">
      {verdicts.map((v, i) => (
        <span key={i} className={`dx-pip tone-${verdictTone(v)}`} title={v ? VERDICT[v].label : 'No verdict'} />
      ))}
    </span>
  )
}

export function Bar({ parts }: { parts: { tone: Tone; value: number; label: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  return (
    <div className="dx-bar" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(', ')}>
      {total > 0 &&
        parts.filter((p) => p.value > 0).map((p) => <span key={p.label} className={`tone-${p.tone}`} style={{ flex: p.value }} />)}
    </div>
  )
}

export function PageHeader({
  title,
  count,
  sub,
  lede,
  meta,
  actions,
}: {
  title: ReactNode
  count?: number
  /** Background on the page, behind an ⓘ. */
  sub?: ReactNode
  /** One plain sentence under the title. */
  lede?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="dx-page-h">
      <div style={{ minWidth: 0 }}>
        <h1 className="dx-row" style={{ gap: 6 }}>
          <span>
            {title}
            {count != null && <span className="dx-count"> ({count})</span>}
          </span>
          {sub && <Info label="About this page">{sub}</Info>}
        </h1>
        {lede && <p className="dx-page-sub">{lede}</p>}
        {meta && <div className="dx-page-meta">{meta}</div>}
      </div>
      {actions && <div className="dx-page-actions">{actions}</div>}
    </header>
  )
}

export function Panel({
  title,
  count,
  desc,
  actions,
  flush,
  footer,
  tone,
  id,
  children,
}: {
  title?: ReactNode
  count?: number
  desc?: ReactNode
  actions?: ReactNode
  flush?: boolean
  footer?: ReactNode
  tone?: 'warn'
  id?: string
  children: ReactNode
}) {
  return (
    <section className={`dx-panel${tone ? ` dx-panel-tone-${tone}` : ''}`} id={id}>
      {title && (
        <div className="dx-panel-h">
          <h2>
            {title}
            {count != null && <span className="dx-count"> ({count})</span>}
          </h2>
          {desc && (typeof desc === 'string' && desc.length > 32 ? <Info label="About this section">{desc}</Info> : <span className="dx-panel-desc">{desc}</span>)}
          {actions && <div className="dx-panel-h-end">{actions}</div>}
        </div>
      )}
      <div className={flush ? 'dx-panel-b-flush' : 'dx-panel-b'}>{children}</div>
      {footer && <div className="dx-panel-foot">{footer}</div>}
    </section>
  )
}

export function Stats({ children }: { children: ReactNode }) {
  return <div className="dx-stats">{children}</div>
}

export function Stat({
  label,
  value,
  sub,
  href,
  tone,
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  href?: string
  tone?: Tone
}) {
  const body = (
    <>
      <span className="dx-stat-label">
        {tone && <span className={`dx-dot tone-${tone}`} aria-hidden="true" />}
        {label}
      </span>
      <span className="dx-stat-value">{value}</span>
      {sub != null && <span className="dx-stat-sub">{sub}</span>}
    </>
  )
  return href ? (
    <a className="dx-stat" href={href}>
      {body}
    </a>
  ) : (
    <div className="dx-stat">{body}</div>
  )
}

export function KV({ items, cols = 1 }: { items: [ReactNode, ReactNode][]; cols?: number }) {
  return (
    <dl className="dx-kv" style={{ ['--kv-cols' as string]: cols }}>
      {items.map(([k, v], i) => (
        <div key={i}>
          <dt>{k}</dt>
          <dd>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Empty({ icon = 'info', title, children }: { icon?: DIconName; title: string; children?: ReactNode }) {
  return (
    <div className="dx-empty">
      <DIcon name={icon} size={20} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  )
}

export function Alert({ tone = 'neutral', icon = 'info', children }: { tone?: Tone; icon?: DIconName; children: ReactNode }) {
  return (
    <div className={`dx-alert tone-${tone}`} role="note">
      <DIcon name={icon} />
      <div>{children}</div>
    </div>
  )
}

/** Evidence ID that opens the evidence drawer for the run on screen. */
export function EvidenceChip({ id, source }: { id: string; source?: string }) {
  const loc = useLocation()
  return (
    <a className="dx-evidence" href={withEvidence(loc, id)} title={source ? `${source} · ${id}` : id}>
      {source && !id.startsWith(source) && <span className="dx-evidence-src">{shortSource(source)}</span>}
      {id}
    </a>
  )
}

function shortSource(s: string) {
  return s.replace(/^zetaris[:/.]?/i, '').split(/[./]/).pop() || s
}

export function Refs({ refs, empty = '—', max = 6 }: { refs: SourceRef[]; empty?: ReactNode; max?: number }) {
  const flat = refs.flatMap((r) => r.ids.map((id) => ({ id, source: r.source })))
  if (flat.length === 0) return <span className="dx-faint">{empty}</span>
  const shown = flat.slice(0, max)
  return (
    <span className="dx-chips">
      {shown.map((r) => (
        <EvidenceChip key={`${r.source}:${r.id}`} id={r.id} source={r.source} />
      ))}
      {flat.length > max && <span className="dx-faint">+{flat.length - max}</span>}
    </span>
  )
}

export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false)
  return [
    copied,
    (text: string) => {
      navigator.clipboard?.writeText(text).then(
        () => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        },
        () => {},
      )
    },
  ]
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, copy] = useCopy()
  return (
    <button type="button" className="dx-btn dx-btn-sm dx-btn-ghost" onClick={() => copy(text)} aria-label={`${label}: ${text}`}>
      <DIcon name={copied ? 'check' : 'copy'} size={14} />
      {copied ? 'Copied' : label}
    </button>
  )
}

export function Command({ text }: { text: string }) {
  return (
    <div className="dx-cmd">
      <code>{text}</code>
      <CopyButton text={text} />
    </div>
  )
}

export function Id({ children, copy }: { children: string; copy?: boolean }) {
  const [copied, doCopy] = useCopy()
  if (!copy) return <span className="dx-id">{children}</span>
  return (
    <span className="dx-row" style={{ gap: 4 }}>
      <span className="dx-id">{children}</span>
      <button
        type="button"
        className="dx-btn dx-btn-ghost dx-btn-sm"
        style={{ width: 22, height: 22, padding: 0 }}
        onClick={() => doCopy(children)}
        aria-label={`Copy ${children}`}
      >
        <DIcon name={copied ? 'check' : 'copy'} size={12} />
      </button>
    </span>
  )
}

export function Tabs({ tabs, current }: { tabs: { id: string; label: string; href: string; count?: number; icon?: DIconName }[]; current: string }) {
  return (
    <nav className="dx-tabs" aria-label="Sections">
      {tabs.map((t) => (
        <a key={t.id} href={t.href} aria-current={t.id === current ? 'page' : undefined}>
          {t.label}
          {t.count != null && <span className="dx-tab-count">{t.count}</span>}
        </a>
      ))}
    </nav>
  )
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: ReactNode; count?: number }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="dx-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count != null && <span className="dx-nav-count">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="dx-input">
      <DIcon name="search" size={14} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  )
}

/** Navigates on row click while keeping real links inside the row working. */
export function rowLink(href: string) {
  return {
    className: 'is-link',
    onClick: (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('a,button,summary')) return
      if (e.metaKey || e.ctrlKey) window.open(href, '_blank')
      else window.location.hash = href.replace(/^#/, '')
    },
  }
}

export type { Tone }

/**
 * Raw identifier → a name people read. "meta-store.rows_visible_to_builder" →
 * { name: "Rows visible to builder", scope: "meta-store" }. Keep the raw ID in a
 * title or the evidence drawer so nothing is lost.
 */
export function humanize(id: string): { name: string; scope: string | null } {
  const parts = id.trim().split('.')
  const last = parts.pop() ?? id
  const words = last.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return { name: words.charAt(0).toUpperCase() + words.slice(1), scope: parts.join('.') || null }
}

/** An ⓘ that explains on hover or focus, so explanations don't sit in the page body. */
export function Info({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  return (
    <span className="dx-info">
      <button type="button" className="dx-info-btn" aria-label={label} aria-describedby={id}>
        <DIcon name="info" size={13} />
      </button>
      <span role="tooltip" id={id} className="dx-info-pop">
        {children}
      </span>
    </span>
  )
}

/** Collapsed by default: secondary content one click away. */
export function More({ summary, children, open }: { summary: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="dx-more" open={open}>
      <summary>
        <DIcon name="chevron-right" size={14} className="dx-chev" />
        {summary}
      </summary>
      <div className="dx-more-b">{children}</div>
    </details>
  )
}

/** Marks data from Domino's synthetic test systems, so placeholder names aren't mistaken for real ones. */
export function ExampleTag() {
  return (
    <span className="dx-row" style={{ gap: 2 }}>
      <Tag tone="accent">Example system</Tag>
      <Info label="About example systems">
        A made-up system built to test Domino, with synthetic data. Names like services, files and rule IDs are placeholders. On your own
        changes you’d see your real service names here.
      </Info>
    </span>
  )
}

const STATE_ICON: Record<LatestState, { icon: DIconName; tone: Tone; label: string }> = {
  reproduced_failure: { icon: 'x-circle', tone: 'fail', label: 'Reproduced failure' },
  no_failure_observed: { icon: 'minus-circle', tone: 'neutral', label: 'No failure observed' },
  inconclusive: { icon: 'help-circle', tone: 'warn', label: 'Inconclusive' },
  incomplete: { icon: 'clock', tone: 'accent', label: 'In progress' },
  failed: { icon: 'alert', tone: 'fail', label: 'Run failed' },
  outage: { icon: 'alert', tone: 'warn', label: 'Outage' },
  unreadable: { icon: 'alert', tone: 'fail', label: 'Unreadable' },
  none: { icon: 'dot', tone: 'muted', label: 'No runs' },
}

/** A change's latest state as an icon plus a short word, the same everywhere. */
export function StateMark({ state, label = true }: { state: LatestState; label?: boolean }) {
  const s = STATE_ICON[state]
  return (
    <span className={`dx-state tone-${s.tone}`} title={state in VERDICT ? VERDICT[state as Verdict].label : s.label}>
      <DIcon name={s.icon} size={15} />
      {label && <span>{s.label}</span>}
    </span>
  )
}

// ---------- Dropdown ----------

export interface SelectOption<T extends string> {
  value: T
  /** Main text of the row. */
  label: ReactNode
  /** Secondary text, shown muted after the label. */
  hint?: ReactNode
  /** Small badge on the right, e.g. "Latest". */
  badge?: ReactNode
  /** Coloured dot before the label. */
  tone?: Tone
  /** Plain text for type-to-find and screen readers. */
  text: string
}

/**
 * Our own dropdown: a quiet button that opens a list of rows with a check on
 * the current one. Arrow keys, Enter, Escape, Home/End and type-to-find work;
 * a click outside closes it.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  prefix,
  align = 'left',
  size = 'md',
}: {
  value: T
  options: SelectOption<T>[]
  onChange: (v: T) => void
  /** Accessible name. */
  label: string
  /** Muted text inside the button before the value, e.g. "Run". */
  prefix?: ReactNode
  align?: 'left' | 'right'
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [side, setSide] = useState(align)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const id = useId()
  const current = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    // Open towards whichever side has room, so the menu never leaves the screen.
    const r = rootRef.current?.getBoundingClientRect()
    if (r) setSide(align === 'right' && r.right < 300 ? 'left' : align === 'left' && window.innerWidth - r.left < 300 ? 'right' : align)
    const onDown = (e: PointerEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const choose = (i: number) => {
    const o = options[i]
    if (o) onChange(o.value)
    setOpen(false)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(options.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(options.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(active)
    } else if (e.key === 'Tab') {
      setOpen(false)
    } else if (e.key.length === 1) {
      const now = Date.now()
      typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : '') + e.key.toLowerCase(), at: now }
      const hit = options.findIndex((o) => o.text.toLowerCase().includes(typed.current.text))
      if (hit >= 0) setActive(hit)
    }
  }

  return (
    <div className={`dx-dd${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`dx-dd-btn${size === 'sm' ? ' is-sm' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}: ${current?.text ?? ''}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
      >
        {prefix && <span className="dx-dd-prefix">{prefix}</span>}
        {current?.tone && <span className={`dx-dot tone-${current.tone}`} aria-hidden="true" />}
        <span className="dx-dd-value">{current?.label}</span>
        <DIcon name="chevron-down" size={12} className="dx-dd-chev" />
      </button>
      {open && (
        <ul className={`dx-dd-menu is-${side}`} role="listbox" id={id} aria-label={label} ref={listRef} tabIndex={-1}>
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              data-i={i}
              aria-selected={o.value === value}
              className={i === active ? 'is-active' : undefined}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              <span className="dx-dd-check" aria-hidden="true">
                {o.value === value && <DIcon name="check" size={13} />}
              </span>
              {o.tone && <span className={`dx-dot tone-${o.tone}`} aria-hidden="true" />}
              <span className="dx-dd-label">{o.label}</span>
              {o.hint && <span className="dx-dd-hint">{o.hint}</span>}
              {o.badge && <span className="dx-dd-badge">{o.badge}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

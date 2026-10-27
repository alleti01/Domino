import { Fragment, useState, type ReactNode } from 'react'
import type { SourceRef, Verdict } from '../types'
import { VERDICT, type Tone } from '../lib/labels'
import type { LatestState } from '../lib/report'
import { rememberOpener } from '../lib/focus'
import { useLocation, withEvidence } from '../lib/router'
import { Icon, type IconName } from './Icon'

export function Badge({ tone, icon, children }: { tone: Tone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`badge tone-${tone}`}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  )
}

/** A verdict in its full canonical wording, with its icon; never truncated. */
export function VerdictMark({ verdict, large = false }: { verdict: Verdict; large?: boolean }) {
  const v = VERDICT[verdict]
  return (
    <span className={`verdict-mark tone-${v.tone}${large ? ' is-large' : ''}`}>
      <Icon name={v.icon} size={large ? 22 : 15} />
      <span>{v.label}</span>
    </span>
  )
}

const STATE_MARK: Record<Exclude<LatestState, Verdict>, { label: string; tone: Tone; icon: IconName }> = {
  incomplete: { label: 'No verdict in the saved trace', tone: 'warn', icon: 'clock' },
  stopped: { label: 'Stopped before a verdict', tone: 'muted', icon: 'alert' },
  failed: { label: 'Run failed before a verdict', tone: 'fail', icon: 'alert' },
  outage: { label: 'Outage, excluded from scoring', tone: 'warn', icon: 'alert' },
  unreadable: { label: 'Trace could not be read', tone: 'fail', icon: 'alert' },
  none: { label: 'No runs saved', tone: 'muted', icon: 'minus-circle' },
}

/** A case's latest state: its verdict, or the reason it has none. */
export function StateMark({ state }: { state: LatestState }) {
  if (state in VERDICT) return <VerdictMark verdict={state as Verdict} />
  const m = STATE_MARK[state as Exclude<LatestState, Verdict>]
  return (
    <span className={`verdict-mark tone-${m.tone}`}>
      <Icon name={m.icon} size={15} />
      <span>{m.label}</span>
    </span>
  )
}

/** Opens a piece of evidence in the side panel. */
export function EvidenceLink({
  id,
  children,
  className,
  label,
}: {
  id: string
  children: ReactNode
  className?: string
  /** Accessible name when the visible text alone is ambiguous. */
  label?: string
}) {
  const loc = useLocation()
  return (
    <a
      className={className}
      href={withEvidence(loc, id)}
      aria-label={label}
      onClick={(e) => rememberOpener(e.currentTarget)}
    >
      {children}
    </a>
  )
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) => (
          <li key={i}>
            {item.href && i < items.length - 1 ? (
              <a href={item.href}>{item.label}</a>
            ) : (
              <span aria-current={i === items.length - 1 ? 'page' : undefined}>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** Source name plus the cited IDs; each ID opens its evidence. */
export function RefChip({ source: r }: { source: SourceRef }) {
  return (
    <span className={`ref-chip${r.source === 'Not found in trace' ? ' ref-missing' : ''}`}>
      <Icon name="database" size={12} />
      <span className="ref-source">{r.source}</span>
      <code className="ref-rows">
        {r.ids.map((id, i) => (
          <span key={id}>
            {i > 0 && ', '}
            <EvidenceLink id={id}>{id}</EvidenceLink>
          </span>
        ))}
      </code>
    </span>
  )
}

export function Refs({ refs, empty }: { refs: SourceRef[]; empty?: ReactNode }) {
  if (refs.length === 0) return empty ? <>{empty}</> : null
  return (
    <span className="refs">
      {refs.map((r) => (
        <RefChip key={r.source} source={r} />
      ))}
    </span>
  )
}

/** A dotted or snake_case name that may wrap only after its separators. */
export function Ident({ name }: { name: string }) {
  const parts = name.split(/(?<=[._-])/)
  return (
    <code className="ident">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {p}
        </Fragment>
      ))}
    </code>
  )
}

export function PlaceholderNotice() {
  return (
    <div className="placeholder-notice" role="note">
      <Icon name="info" size={16} />
      <span>
        <strong>Placeholder data.</strong> This is a layout preview, not a Domino result. It will be
        replaced by saved agent traces.
      </span>
    </div>
  )
}

/** Shell commands in a copyable block. */
export function CommandBlock({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false)
  const text = lines.join('\n')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="command">
      <pre>
        <code>{text}</code>
      </pre>
      <button type="button" className="button" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <span className="visually-hidden" role="status">
        {copied ? 'Commands copied' : ''}
      </span>
    </div>
  )
}

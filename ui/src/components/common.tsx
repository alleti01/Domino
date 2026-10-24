import { useState, type ReactNode } from 'react'
import type { SourceRef } from '../types'
import type { Tone } from '../lib/labels'
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

export function Section({
  id,
  title,
  icon,
  lede,
  children,
}: {
  id: string
  title: string
  icon: IconName
  lede?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="section" id={id} aria-labelledby={`${id}-title`}>
      <header className="section-head">
        <h2 id={`${id}-title`}>
          <Icon name={icon} size={18} />
          {title}
        </h2>
        {lede && <p className="section-lede">{lede}</p>}
      </header>
      {children}
    </section>
  )
}

export function Pending({ children }: { children: ReactNode }) {
  return (
    <p className="pending">
      <Icon name="clock" size={16} />
      {children}
    </p>
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

import type { ReactNode } from 'react'

/** One section of the landing-page tour: kicker, title, lede, content, then a deep link. */
export function TourSection({
  id,
  kicker,
  title,
  lede,
  placeholder,
  link,
  children,
  className = '',
}: {
  id: string
  kicker: string
  title: string
  lede?: ReactNode
  placeholder?: boolean
  link?: { href: string; label: string }
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} className={`tour ${className}`} aria-labelledby={`${id}-title`} tabIndex={-1}>
      <div className="tour-head">
        <p className="block-kicker">
          {kicker}
          {placeholder && <span className="tour-placeholder">Placeholder data</span>}
        </p>
        <h2 id={`${id}-title`} className="block-title">
          {title}
        </h2>
        {lede && <p className="tour-lede">{lede}</p>}
      </div>
      {children}
      {link && (
        <a className="tour-link" href={link.href}>
          {link.label} <span aria-hidden="true">→</span>
        </a>
      )}
    </section>
  )
}

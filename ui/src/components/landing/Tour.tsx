import type { ReactNode } from 'react'
import { Reveal, ScrambleText } from './Motion'

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
  navTheme,
  decoration,
}: {
  id: string
  kicker: string
  title: string
  lede?: ReactNode
  placeholder?: boolean
  link?: { href: string; label: string }
  children: ReactNode
  className?: string
  /** Set to "light" for sections the nav should switch to its light look over. */
  navTheme?: 'light'
  /** Decorative shapes drawn behind the section (hidden from screen readers). */
  decoration?: ReactNode
}) {
  return (
    <section id={id} className={`tour ${className}`} aria-labelledby={`${id}-title`} tabIndex={-1} data-nav-theme={navTheme}>
      {decoration && (
        <div className="tour-decoration" aria-hidden="true">
          {decoration}
        </div>
      )}
      <Reveal className="tour-head">
        <p className="block-kicker">
          <ScrambleText text={kicker} />
          {placeholder && <span className="tour-placeholder">Placeholder data</span>}
        </p>
        <h2 id={`${id}-title`} className="block-title">
          {title}
        </h2>
        {lede && <p className="tour-lede">{lede}</p>}
      </Reveal>
      <Reveal delay={0.12}>{children}</Reveal>
      {link && (
        <a className="tour-link" href={link.href}>
          {link.label} <span aria-hidden="true">→</span>
        </a>
      )}
    </section>
  )
}

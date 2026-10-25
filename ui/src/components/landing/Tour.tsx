import type { ReactNode } from 'react'
import { ArrowLink, Reveal } from './Motion'

/**
 * One numbered section of the landing page. Its node sits on the chain line
 * that runs down the page and fills in once the section is reached.
 */
export function TourSection({
  id,
  number,
  kicker,
  title,
  titleTail,
  lede,
  placeholder,
  link,
  children,
  className = '',
  navTheme,
}: {
  id: string
  /** "01", "02"… */
  number: string
  kicker: string
  /** First, upright part of the two-tone title. */
  title: string
  /** Second, italic part of the title. */
  titleTail?: string
  lede?: ReactNode
  placeholder?: boolean
  link?: { href: string; label: string }
  children: ReactNode
  className?: string
  /** Set to "dark" on dark sections so the nav switches to light text over them. */
  navTheme?: 'dark'
}) {
  return (
    <section id={id} className={`tour ${className}`} aria-labelledby={`${id}-title`} tabIndex={-1} data-nav-theme={navTheme}>
      <Reveal className="tour-head">
        <span className="tour-node" aria-hidden="true" />
        <p className="tour-kicker">
          <span className="tour-num">{number}</span>
          {kicker}
          {placeholder && <span className="tour-placeholder">Placeholder data</span>}
        </p>
        <h2 id={`${id}-title`} className="tour-title">
          {title}
          {titleTail && (
            <>
              {' '}
              <em>{titleTail}</em>
            </>
          )}
        </h2>
        {lede && <p className="tour-lede">{lede}</p>}
      </Reveal>
      <Reveal delay={0.1} className="tour-body">
        {children}
      </Reveal>
      {link && <ArrowLink className="tour-link" href={link.href}>{link.label}</ArrowLink>}
    </section>
  )
}

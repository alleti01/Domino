import type { ReactNode } from 'react'

/** The arrow whose shaft stretches on hover (styled in landing.css). */
export function Arrow({ down = false }: { down?: boolean }) {
  return (
    <svg className={`arrow${down ? ' arrow-down' : ''}`} width="22" height="12" viewBox="0 0 22 12" aria-hidden="true" focusable="false">
      <rect className="arrow-shaft" x="0" y="5.25" width="16" height="1.5" />
      <path className="arrow-head" d="M14 1.5 18.5 6 14 10.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

/** A text link followed by the stretching arrow. */
export function ArrowLink({
  href,
  children,
  className = '',
  external = false,
}: {
  href: string
  children: ReactNode
  className?: string
  external?: boolean
}) {
  return (
    <a className={`arrow-link ${className}`} href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
      <span>{children}</span>
      <Arrow />
      {external && <span className="visually-hidden"> (opens in a new tab)</span>}
    </a>
  )
}

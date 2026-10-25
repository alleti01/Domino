import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useInView } from '../../hooks/useInView'

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Fades and lifts its content into place once it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode
  /** Seconds to wait after entering view, for staggering siblings. */
  delay?: number
  className?: string
}) {
  const [ref, inView] = useInView<HTMLDivElement>(0.12)
  return (
    <div
      ref={ref}
      className={`reveal${inView ? ' is-visible' : ''} ${className}`}
      style={{ '--reveal-delay': `${delay}s` } as CSSProperties}
    >
      {children}
    </div>
  )
}

const DURATION_MS = 1100
const STEP_MS = 30
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * A measured value that rolls up from zero when it scrolls into view, e.g.
 * "85/85" or "140". Non-numeric text is shown as is. Screen readers get the
 * final value only.
 */
export function CountUp({ value }: { value: string }) {
  const [ref, inView] = useInView<HTMLSpanElement>(0.5)
  const [t, setT] = useState(0)

  useEffect(() => {
    if (!inView || prefersReducedMotion()) return
    const start = Date.now()
    // setInterval rather than requestAnimationFrame: it still advances in background tabs.
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / DURATION_MS)
      setT(p)
      if (p >= 1) clearInterval(id)
    }, STEP_MS)
    return () => clearInterval(id)
  }, [inView])

  const done = inView && (t >= 1 || prefersReducedMotion())
  const shown = done
    ? value
    : value.replace(/\d+(\.\d+)?/g, (n) => {
        const target = Number(n)
        const now = target * easeOut(inView ? t : 0)
        return n.includes('.') ? now.toFixed(n.split('.')[1].length) : String(Math.round(now))
      })
  return (
    <span ref={ref} className="count-up">
      <span className="visually-hidden">{value}</span>
      <span aria-hidden="true">{shown}</span>
    </span>
  )
}

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

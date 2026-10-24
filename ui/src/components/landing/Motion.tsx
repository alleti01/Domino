import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useInView } from '../../hooks/useInView'

/** Fades and lifts its content into place when it scrolls into view (Cogent: 0 → 1 opacity, 12px rise). */
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

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$'
const STEP_MS = 40

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Short labels that decode from random characters into the real text when
 * they scroll into view. Screen readers get the plain text; the animation is
 * hidden from them.
 */
export function ScrambleText({ text }: { text: string }) {
  const [ref, inView] = useInView<HTMLSpanElement>(0.6)
  const [frame, setFrame] = useState(0)
  const total = text.length + 10

  useEffect(() => {
    if (!inView || prefersReducedMotion()) return
    const id = setInterval(() => {
      setFrame((f) => {
        if (f >= total) clearInterval(id)
        return Math.min(f + 1, total)
      })
    }, STEP_MS)
    return () => clearInterval(id)
  }, [inView, total])

  const done = !inView ? false : prefersReducedMotion() || frame >= total
  return (
    <span ref={ref} className="scramble">
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true">
        {done
          ? text
          : [...text].map((ch, i) => {
              // Characters settle left to right; spaces never scramble.
              if (ch === ' ' || (inView && frame > i + 6)) return <span key={i}>{ch}</span>
              const glyph = GLYPHS[(i * 7 + frame * 3) % GLYPHS.length]
              return (
                <span key={i} className={i % 2 ? 'scramble-glyph-a' : 'scramble-glyph-b'}>
                  {inView ? glyph : ' '}
                </span>
              )
            })}
      </span>
    </span>
  )
}

import { useEffect, useState } from 'react'

/**
 * True once the element has scrolled into view (stays true), for one-shot
 * reveal animations. Returns a callback ref, so it works even when the element
 * only appears after data loads.
 */
export function useInView<T extends Element>(threshold = 0.35) {
  const [node, setNode] = useState<T | null>(null)
  // Without IntersectionObserver there's nothing to wait for: show it straight away.
  const [inView, setInView] = useState(() => !('IntersectionObserver' in window))
  useEffect(() => {
    if (!node || inView) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          io.disconnect()
        }
      },
      { threshold },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [node, inView, threshold])
  return [setNode, inView] as const
}

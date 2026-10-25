import { useEffect, useState } from 'react'

/**
 * How far the middle of the viewport has travelled through an element, 0 to 1,
 * written to the element as --progress. Drives the chain line on the landing page.
 */
export function useScrollProgress<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null)
  useEffect(() => {
    if (!node) return
    const update = () => {
      const r = node.getBoundingClientRect()
      const p = Math.min(1, Math.max(0, (window.innerHeight * 0.55 - r.top) / r.height))
      node.style.setProperty('--progress', p.toFixed(4))
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [node])
  return setNode
}

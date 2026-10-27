import { useEffect } from 'react'

/**
 * Marks <html> with `is-pointer` while the last input was a mouse or touch, so
 * focus rings show only for keyboard users (browsers sometimes show them after
 * a click too, e.g. right after a key press or when code moves focus).
 */
export function useInputMode() {
  useEffect(() => {
    const root = document.documentElement
    const pointer = () => root.classList.add('is-pointer')
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key.startsWith('Arrow')) root.classList.remove('is-pointer')
    }
    addEventListener('pointerdown', pointer, true)
    addEventListener('keydown', key, true)
    return () => {
      removeEventListener('pointerdown', pointer, true)
      removeEventListener('keydown', key, true)
      root.classList.remove('is-pointer')
    }
  }, [])
}

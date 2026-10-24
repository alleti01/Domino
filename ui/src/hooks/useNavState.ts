import { useEffect, useState } from 'react'

/** Height of the band under the nav used to decide which section it's over. */
const PROBE_Y = 40
const SHOW_ABOVE = 120
const JITTER = 6

/**
 * Cogent-style nav: hides while scrolling down, comes back as soon as you
 * scroll up, and switches to its light look over sections marked
 * data-nav-theme="light".
 */
export function useNavState() {
  const [hidden, setHidden] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    let lastY = window.scrollY
    // Runs on every scroll event: cheap (a few rect reads), and unlike a
    // requestAnimationFrame it still fires when the page isn't painting.
    const update = () => {
      const y = window.scrollY
      if (y < SHOW_ABOVE) setHidden(false)
      else if (y > lastY + JITTER) setHidden(true)
      else if (y < lastY - JITTER) setHidden(false)
      if (Math.abs(y - lastY) > JITTER || y < SHOW_ABOVE) lastY = y

      const light = [...document.querySelectorAll<HTMLElement>('[data-nav-theme="light"]')].some((el) => {
        const r = el.getBoundingClientRect()
        return r.top <= PROBE_Y && r.bottom >= PROBE_Y
      })
      setTheme(light ? 'light' : 'dark')
    }
    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => window.removeEventListener('scroll', update)
  }, [])

  return { hidden, theme }
}

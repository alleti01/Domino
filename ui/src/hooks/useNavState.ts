import { useEffect, useState } from 'react'

/** The band under the nav used to decide which section it's over. */
const PROBE_Y = 40
const SHOW_ABOVE = 120
const JITTER = 6

/**
 * The landing nav: hides while scrolling down, comes back as soon as you
 * scroll up, gains a backing once the page has scrolled, and switches to
 * light text over sections marked data-nav-theme="dark".
 */
export function useNavState() {
  const [hidden, setHidden] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('light')

  useEffect(() => {
    let lastY = window.scrollY
    // Runs on every scroll event: cheap (a few rect reads), and unlike a
    // requestAnimationFrame it still fires when the page isn't painting.
    const update = () => {
      const y = window.scrollY
      setScrolled(y > 8)
      if (y < SHOW_ABOVE) setHidden(false)
      else if (y > lastY + JITTER) setHidden(true)
      else if (y < lastY - JITTER) setHidden(false)
      if (Math.abs(y - lastY) > JITTER || y < SHOW_ABOVE) lastY = y

      const dark = [...document.querySelectorAll<HTMLElement>('[data-nav-theme="dark"]')].some((el) => {
        const r = el.getBoundingClientRect()
        return r.top <= PROBE_Y && r.bottom >= PROBE_Y
      })
      setTheme(dark ? 'dark' : 'light')
    }
    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => window.removeEventListener('scroll', update)
  }, [])

  return { hidden, scrolled, theme }
}

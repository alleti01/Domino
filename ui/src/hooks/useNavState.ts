import { useEffect, useState } from 'react'

/** Fallback probe height when the nav is scrolled out of view. */
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

      // Probe at the nav's own middle: it sits lower while the announcement strip is in view.
      const nav = document.querySelector('.site-nav')?.getBoundingClientRect()
      const probe = nav && nav.bottom > 0 ? nav.top + nav.height / 2 : PROBE_Y
      const dark = [...document.querySelectorAll<HTMLElement>('[data-nav-theme="dark"]')].some((el) => {
        const r = el.getBoundingClientRect()
        return r.top <= probe && r.bottom >= probe
      })
      setTheme(dark ? 'dark' : 'light')
    }
    window.addEventListener('scroll', update, { passive: true })
    // Sections mount and change height after data loads, without a scroll.
    const ro = new ResizeObserver(() => update())
    ro.observe(document.body)
    update()
    return () => {
      window.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])

  return { hidden, scrolled, theme }
}

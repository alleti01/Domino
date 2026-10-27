import type { MouseEvent } from 'react'
import { smoothScrollTo } from './smoothScroll'

/** Until when (performance.now) a navigation scroll is under way; scroll-held sections let it pass. */
export const navScroll = { until: 0 }
export const navigating = () => performance.now() < navScroll.until
/** Marks a scroll the code is about to make as navigation, for `ms` milliseconds. */
export function markNav(ms = 2500) {
  navScroll.until = performance.now() + ms
}

// Hash routing owns location.hash, so in-page links scroll instead of navigating.
export function jumpTo(ev: MouseEvent, id: string) {
  ev.preventDefault()
  scrollToSection(id, { smooth: true })
}

/**
 * Scrolls a section into view and moves focus to it. Smooth only for in-page
 * clicks: after navigation (?section=chain) the page is still settling and a
 * smooth scroll can be cancelled, so it jumps instead.
 */
export function scrollToSection(id: string, { smooth = false } = {}) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  markNav()
  if (!smoothScrollTo(el, { smooth: smooth && !reduce })) {
    el.scrollIntoView({ behavior: smooth && !reduce ? 'smooth' : 'auto', block: 'start' })
  }
  el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
}

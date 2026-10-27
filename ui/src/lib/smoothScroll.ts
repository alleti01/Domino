// Smooth, eased page scrolling (Lenis): the page glides a little behind the
// wheel, as on Cogent's site. Landing pages only; it steps aside for people who
// ask for reduced motion, and touch scrolling stays native.
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

let lenis: Lenis | null = null

export function startSmoothScroll() {
  lenis ??= new Lenis({ autoRaf: true, lerp: 0.085, wheelMultiplier: 0.95, respectReducedMotion: true, stopInertiaOnNavigate: true })
}

export function stopSmoothScroll() {
  lenis?.destroy()
  lenis = null
}

/** Scrolls with Lenis when it's running, so it doesn't fight a native jump. Returns false if not running. */
export function smoothScrollTo(el: HTMLElement, { smooth }: { smooth: boolean }): boolean {
  if (!lenis) return false
  // Sections can grow after data loads; make sure Lenis isn't clamping to an old page height.
  lenis.resize()
  // Lenis already honours the element's scroll-margin-top.
  lenis.scrollTo(el, { immediate: !smooth, duration: 1.1 })
  return true
}

/**
 * Puts the page at y at once and drops any glide still under way. Code that
 * holds or jumps the scroll (pinned sections, a new page) goes through here, so
 * Lenis doesn't ease back to where it was heading.
 */
export function jumpScroll(y: number) {
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true })
  else window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior })
}

/** Glides to y: through Lenis when it's running, natively otherwise. */
export function glideScroll(y: number) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (lenis && !reduce) lenis.scrollTo(y, { duration: 1.1 })
  else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' })
}

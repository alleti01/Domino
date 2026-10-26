// Smooth, eased page scrolling (Lenis), as on Cogent's site. Landing pages only;
// it steps aside for people who ask for reduced motion.
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

let lenis: Lenis | null = null

export function startSmoothScroll() {
  lenis ??= new Lenis({ autoRaf: true, lerp: 0.1, respectReducedMotion: true, stopInertiaOnNavigate: true })
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

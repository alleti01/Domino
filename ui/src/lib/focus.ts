// Remembers which link opened the evidence panel so focus can go back there
// when it closes (the URL change re-renders the page, so we keep an element ref).
let opener: HTMLElement | null = null

export function rememberOpener(el: HTMLElement | null) {
  opener = el
}

// The opener is kept (not cleared) after restoring: React's dev-mode double
// mount runs this cleanup once while the panel is still open.
export function restoreOpenerFocus() {
  if (opener && document.contains(opener)) opener.focus({ preventScroll: true })
}

const FOCUSABLE = 'a[href], button:not([disabled]), select, input, textarea, [tabindex]:not([tabindex="-1"])'

/** Keeps Tab and Shift+Tab inside `root`. Returns true if it handled the key. */
export function trapTab(e: KeyboardEvent, root: HTMLElement): boolean {
  if (e.key !== 'Tab') return false
  const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
  if (items.length === 0) return false
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  if (e.shiftKey && (active === first || active === root)) {
    last.focus()
    e.preventDefault()
    return true
  }
  if (!e.shiftKey && active === last) {
    first.focus()
    e.preventDefault()
    return true
  }
  return false
}

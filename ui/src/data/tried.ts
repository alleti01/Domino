// The recorded changes this visitor has run from the landing page, for this
// visit only: they stay while moving between the landing page and the console
// (and across a reload), and are gone once the tab is closed. Storage can be
// missing or blocked; then the list is just empty.

import { useEffect, useState } from 'react'

const KEY = 'domino.tried.v1'
const EVENT = 'domino:tried'

export interface Tried {
  caseId: string
  /** When the visitor ran it (ms since epoch). */
  at: number
}

export function readTried(): Tried[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((t): t is Tried => typeof t?.caseId === 'string' && typeof t?.at === 'number') : []
  } catch {
    return []
  }
}

/** Records a run; the newest first, one entry per change. */
export function addTried(caseId: string) {
  const next = [{ caseId, at: Date.now() }, ...readTried().filter((t) => t.caseId !== caseId)]
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private window or blocked storage: the run still plays, it just isn't kept.
  }
  dispatchEvent(new Event(EVENT))
}

/** The tried changes, kept up to date as the visitor runs more. */
export function useTried(): Tried[] {
  const [tried, setTried] = useState(readTried)
  useEffect(() => {
    const update = () => setTried(readTried())
    addEventListener(EVENT, update)
    return () => removeEventListener(EVENT, update)
  }, [])
  return tried
}

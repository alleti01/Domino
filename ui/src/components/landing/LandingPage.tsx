import { useEffect } from 'react'
import type { SiteState } from '../../data/useSite'
import { scrollToSection } from '../../lib/scroll'
import { Landing } from './giga/Landing'

export function LandingPage({ state, section }: { state: SiteState; section: string | null }) {
  // ?section=how (from the nav) scrolls to that part of the page.
  useEffect(() => {
    if (section) scrollToSection(section)
  }, [section, state.status])
  return <Landing site={state.status === 'ready' ? state.site : null} />
}

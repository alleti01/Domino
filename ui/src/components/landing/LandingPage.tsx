import { useEffect } from 'react'
import type { SiteState } from '../../data/useSite'
import { href } from '../../lib/router'
import { scrollToSection } from '../../lib/scroll'
import { flagship } from '../../lib/showcase'
import { Story } from './story/Story'
import { BuiltWith, Closing, Faq, Outcomes } from './Supporting'

/**
 * One explanation, told once: the 3D story (hero and four chapters), the
 * outcomes across cases, what it's built with, a short FAQ and the way in.
 * The detail lives in the reports.
 */
export function LandingPage({ state, section }: { state: SiteState; section: string | null }) {
  // ?section=how (from the nav) scrolls to that part of the page.
  useEffect(() => {
    if (section) scrollToSection(section)
  }, [section, state.status])

  const site = state.status === 'ready' ? state.site : null
  const show = site ? flagship(site.cases) : null

  return (
    <div className="landing">
      <Story show={show} />
      {site && <Outcomes site={site} />}
      <BuiltWith />
      <Faq />
      <Closing reportHref={show ? href.case(show.caseEntry.id) : href.cases} />
    </div>
  )
}

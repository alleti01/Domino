// Copy shared by the landing page and the dashboard. Keep claims honest: the
// verdict wording rules in src/lib/labels.ts apply here too.

import type { IconName } from './components/Icon'
import type { Verdict } from './types'
import { REPO_URL } from './config'

export const ONE_LINER = 'Find what your change breaks, before you ship it.'

export const PITCH =
  'A change can be correct on its own and still break something two systems away. Domino reads a proposed change, joins the code, data and runtime facts around it, runs the experiment that would expose a hidden failure, and shows you the proof.'

export interface Step {
  key: 'change' | 'connect' | 'suspect' | 'test' | 'conclude'
  title: string
  text: string
  tech: string
  icon: IconName
  /** Report section the step corresponds to. */
  section: string
}

export const STEPS: Step[] = [
  {
    key: 'change',
    title: 'Change',
    text: 'Reads the pull request and lists what it touches, tied to source lines.',
    tech: 'Domino',
    icon: 'file-code',
    section: 'change',
  },
  {
    key: 'connect',
    title: 'Connect',
    text: 'Joins code, catalog and runtime facts into one dependency path. No single source holds it.',
    tech: 'Zetaris semantic layer',
    icon: 'database',
    section: 'chain',
  },
  {
    key: 'suspect',
    title: 'Suspect',
    text: 'Forms hypotheses about what could break, each citing the rows behind it.',
    tech: 'NVIDIA Nemotron via Meterless Nightshift',
    icon: 'cpu',
    section: 'hypotheses',
  },
  {
    key: 'test',
    title: 'Test',
    text: 'Runs baseline, candidate and control side by side, keeping what it learns in memory.',
    tech: 'Sandbox + Meterless World Model',
    icon: 'flask',
    section: 'experiments',
  },
  {
    key: 'conclude',
    title: 'Conclude',
    text: 'A rule-based judge, not the model, decides one of three verdicts and states what wasn’t tested.',
    tech: 'Deterministic judge',
    icon: 'flag',
    section: 'verdict',
  },
]

export const VERDICT_MEANING: [Verdict, string][] = [
  ['reproduced_failure', 'The candidate failed where the baseline and control passed, under the tested conditions.'],
  ['no_failure_observed', 'Everything tested passed. This is not a guarantee the change is fine in production.'],
  ['inconclusive', 'The evidence or test environment wasn’t enough to decide either way.'],
]

/** Real incidents whose mechanisms the cases recreate. Sources are the companies' own postmortems. */
export const INCIDENTS = [
  {
    name: 'Cloudflare, November 2025',
    mechanism:
      'A database permissions change made a metadata query return duplicate rows. A generated file doubled in size and crossed a limit in the service that loads it.',
    source: 'https://blog.cloudflare.com/18-november-2025-outage/',
  },
  {
    name: 'CrowdStrike, July 2024',
    mechanism:
      'A content update supplied 21 input fields to a component that expected 20, causing an out-of-bounds read and widespread Windows crashes.',
    source:
      'https://www.crowdstrike.com/wp-content/uploads/2024/08/Executive-Summary_Root-Cause-Analysis_Channel-File-291.pdf',
  },
]

export const RUN_LOCALLY = [`git clone ${REPO_URL}.git`, 'cd Domino/ui', 'npm install', 'npm run dev']

// Changelog: what changed in the console, newest first. Add a release at the
// top of RELEASES; each entry links to where the change can be seen.

import { href } from '../../lib/router'
import { DIcon } from '../icons'
import { PageHeader } from '../ui'

type Kind = 'New' | 'Improved' | 'Fixed'

interface Entry {
  kind: Kind
  title: string
  text: string
  points?: string[]
  link?: { label: string; href: string }
}

interface Release {
  date: string
  title: string
  summary: string
  entries: Entry[]
}

const RELEASES: Release[] = [
  {
    date: 'Oct 27, 2026',
    title: 'The Domino console',
    summary:
      'A new dashboard for reading investigations: answer first, plain language, details one click away. Built in the same palette as the landing page and laid out like an infrastructure console.',
    entries: [
      {
        kind: 'New',
        title: 'Live check',
        text: 'Watch what happens when a pull request opens: the pipeline stages, the dependency path drawing itself, the sandbox runs, a readable feed of each step, then the result. Replays a recorded run’s real events, sped up, and loops through every change.',
        link: { label: 'Open Live check', href: href.live() },
      },
      {
        kind: 'New',
        title: 'Projects and recent runs',
        text: 'A project switcher at the top of the sidebar, with Add project for connecting more repositories from the command line, and the latest runs listed in the sidebar with their result and when they ran.',
        link: { label: 'Add a project', href: href.docs('cli') },
      },
      {
        kind: 'New',
        title: 'Console layout',
        text: 'Grouped sidebar, breadcrumbs, ⌘K search across pages, changes and run IDs, and our own dropdowns and ⓘ explanations instead of browser defaults.',
        points: ['Overview, Investigations and Runs under one navigation', 'Explanations behind ⓘ instead of paragraphs on the page', 'The real Domino mark and a Geist wordmark'],
      },
      {
        kind: 'New',
        title: 'Live data from the agent',
        text: 'The dev server serves the run folders and the console checks for changes every 4 seconds. A run the agent is still writing shows as in progress and fills in without a reload.',
        points: ['npm run dev reads ../samples', 'npm run dev:live also watches ../agent/runs'],
        link: { label: 'How it works', href: href.docs('data') },
      },
      {
        kind: 'New',
        title: 'Investigation report',
        text: 'Every report opens on an answer: what the change breaks, the deciding measurement as bars against the limit, and whether repeats agree, the reviewer approved and Nemotron answered.',
        points: [
          'How it breaks: the path from the change to what stopped, one step per line, animated',
          'What was committed, what breaks and how to fix it, side by side',
          'Five tabs: Summary, Evidence, Experiments, Activity, PR comment',
        ],
      },
      {
        kind: 'New',
        title: 'Dependency map canvas',
        text: 'The map always fits its frame. Drag the background to pan, drag cards to move them with links attached, zoom with ⌘/Ctrl + scroll, and Center view appears once anything has moved.',
      },
      {
        kind: 'New',
        title: 'PR comment with Copy as Markdown',
        text: 'A GitHub-style check and bot comment built from the run, and the exact Markdown to paste into a pull request.',
      },
      {
        kind: 'Improved',
        title: 'Plain language everywhere',
        text: 'Identifiers read as words: “Rows visible to builder” instead of meta-store.rows_visible_to_builder, “is loaded by” instead of loaded_by, “Database catalog” instead of db_catalog. Raw IDs stay on hover.',
        points: ['What each component does comes from the change’s own description', 'Example systems are labelled so placeholder names aren’t mistaken for real ones'],
      },
      {
        kind: 'Improved',
        title: 'Experiments, Evidence and Activity',
        text: 'Only what differs between runs is shown by default, identical repeats share a column, links and hypotheses are one line each, and the activity log reads as a story of milestones instead of 49 raw events.',
      },
      {
        kind: 'Improved',
        title: 'Overview, Investigations, Runs and Results',
        text: 'Each page leads with an answer card. Investigations shows what moved as small bars against the limit; Results shows every run as a coloured square, so agreement across repeats is visible at a glance.',
      },
      {
        kind: 'Improved',
        title: 'Model calls and Semantic layer',
        text: 'Which model answered each call, read from Nightshift receipts, with a share bar per model; and which sources the semantic layer joined and which kinds of links it found, observed versus inferred.',
      },
      {
        kind: 'Fixed',
        title: 'Runs still being written no longer show as failed',
        text: 'The agent logs a model error and then retries, so an unfinished trace is only marked failed if it stops on an unrecoverable error.',
      },
      {
        kind: 'Fixed',
        title: 'Phone layouts',
        text: 'No page scrolls sideways on a phone; tables collapse to the essentials and lists wrap.',
      },
    ],
  },
]

export function Changelog() {
  return (
    <>
      <PageHeader title="Changelog" sub="What changed in the Domino console, newest first." />
      <div className="dx-cl">
        {RELEASES.map((r) => (
          <section key={r.date} className="dx-cl-release">
            <div className="dx-cl-date">
              <span>{r.date}</span>
            </div>
            <div className="dx-cl-body">
              <h2>{r.title}</h2>
              <p className="dx-cl-summary">{r.summary}</p>
              <ol className="dx-cl-entries">
                {r.entries.map((e) => (
                  <li key={e.title}>
                    <span className={`dx-cl-kind is-${e.kind.toLowerCase()}`}>{e.kind}</span>
                    <div>
                      <h3>{e.title}</h3>
                      <p>{e.text}</p>
                      {e.points && (
                        <ul>
                          {e.points.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                      )}
                      {e.link && (
                        <a className="dx-link-quiet" href={e.link.href}>
                          {e.link.label} <DIcon name="arrow-right" size={12} />
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ))}
      </div>
    </>
  )
}

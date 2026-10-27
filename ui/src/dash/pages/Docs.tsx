// Docs: how to run, read and extend Domino. Laid out like product docs: page
// navigation on the left, the article in the middle, "On this page" on the
// right. Pages live in PAGES; the Command line page lists the `domino` commands.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { href } from '../../lib/router'
import { DIcon } from '../icons'
import { useCopy } from '../ui'

interface Section {
  id: string
  title: string
  body: ReactNode
}

interface DocPage {
  id: string
  group: string
  title: string
  lede: string
  sections: Section[]
}

function Code({ lines, label }: { lines: string[]; label?: string }) {
  const [copied, copy] = useCopy()
  return (
    <div className="dx-doc-code">
      <div className="dx-doc-code-h">
        <span>{label ?? 'Terminal'}</span>
        <button type="button" onClick={() => copy(lines.join('\n'))} aria-label="Copy">
          <DIcon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        {lines.map((l, i) => (
          <div key={i} className={l.startsWith('#') ? 'is-comment' : undefined}>
            {l}
          </div>
        ))}
      </pre>
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="dx-doc-note">
      <DIcon name="info" size={14} />
      <div>{children}</div>
    </div>
  )
}

const PAGES: DocPage[] = [
  {
    id: 'introduction',
    group: 'Get started',
    title: 'Introduction',
    lede: 'Domino finds what a change will break before it ships, runs the test that proves it, and shows the evidence.',
    sections: [
      {
        id: 'problem',
        title: 'The problem',
        body: (
          <p>
            A change can be correct on its own and still break something two systems away: a permission that doubles the rows a job reads, a rule
            that needs more fields than a downstream service supplies. Each system’s facts live somewhere different, so nobody sees the whole path
            until production does.
          </p>
        ),
      },
      {
        id: 'how',
        title: 'How an investigation works',
        body: (
          <ol className="dx-doc-steps">
            <li>
              <b>Read the change.</b> The pull request’s title, description, files and diff.
            </li>
            <li>
              <b>Join the systems.</b> Zetaris combines change records, database grants, service settings, the service catalog and telemetry into one
              semantic layer, and Domino follows the path from the change to what it can reach.
            </li>
            <li>
              <b>Form testable guesses.</b> NVIDIA Nemotron, called through Meterless Nightshift, proposes hypotheses with what would disprove them.
            </li>
            <li>
              <b>Test it.</b> The system runs in a sandbox without the change, with it, and with it undone.
            </li>
            <li>
              <b>Decide.</b> A deterministic judge sets the verdict from those runs; a second Nemotron model checks the explanation against the evidence.
            </li>
          </ol>
        ),
      },
      {
        id: 'output',
        title: 'What you get',
        body: (
          <ul>
            <li>A verdict: reproduced failure, no failure observed, or inconclusive.</li>
            <li>The path from the change to what broke, with the source rows behind every link.</li>
            <li>The sandbox measurements, a suggested fix (marked untested) and a comment ready for the pull request.</li>
          </ul>
        ),
      },
    ],
  },
  {
    id: 'quickstart',
    group: 'Get started',
    title: 'Quickstart',
    lede: 'Run the console on your machine, watch the agent work, and run an investigation.',
    sections: [
      {
        id: 'console',
        title: 'Run the console',
        body: (
          <>
            <Code lines={['cd ui', 'npm install', 'npm run dev', '# open http://localhost:5173']} />
            <Note>With no project connected the console is empty; it never shows sample or placeholder data.</Note>
          </>
        ),
      },
      {
        id: 'connect',
        title: 'Connect a project',
        body: (
          <>
            <p>
              The console only shows runs from a connected project; there is no sample data. <code>domino dashboard</code> starts it on the agent’s
              live runs folder. Runs appear as the agent writes them and update every few seconds.
            </p>
            <Code lines={['cd agent && npm install && npm link   # once', 'domino dashboard --open']} />
            <Note>
              To point the console at another runs folder, start it yourself: <code>DOMINO_RUNS_DIR=/path/to/runs npm run dev</code> in <code>ui</code>.
            </Note>
          </>
        ),
      },
      {
        id: 'investigate',
        title: 'Run an investigation',
        body: (
          <>
            <p>
              Replay recorded investigations with no keys, or run a new one. A new run needs Meterless Nightshift running locally with Nemotron lanes.
            </p>
            <Code
              lines={[
                'domino demo                          # replays recordings, no keys or services',
                'domino run --change <world-id>       # one live investigation',
                'domino pr 12 --repo owner/name       # check one pull request',
              ]}
            />
          </>
        ),
      },
      {
        id: 'build',
        title: 'Build a static copy',
        body: (
          <>
            <p>The build bundles the saved runs and opens from any folder or static host.</p>
            <Code lines={['cd ui', 'npm run build   # writes ui/dist']} />
          </>
        ),
      },
    ],
  },
  {
    id: 'reports',
    group: 'Using the console',
    title: 'Reading a report',
    lede: 'Every investigation opens on its answer. The tabs hold the evidence, from plain to technical.',
    sections: [
      {
        id: 'summary',
        title: 'Summary',
        body: (
          <p>
            What the change breaks in plain words, the deciding measurement as bars against its limit, and three trust checks: whether repeats agree,
            whether the reviewer approved the explanation, and whether Nemotron answered every call. <b>How it breaks</b> draws the path from the
            change to what stopped, then what was committed, what broke and how to fix it.
          </p>
        ),
      },
      {
        id: 'evidence',
        title: 'Evidence',
        body: (
          <p>
            The dependency map from the semantic layer. Drag to pan, drag cards to move them, ⌘/Ctrl + scroll to zoom. Below it every link, hypothesis and
            the change itself, each opening to the source rows behind it.
          </p>
        ),
      },
      {
        id: 'experiments',
        title: 'Experiments',
        body: <p>The result of each version, then only the measurements and checks that differ between runs, then each sandbox run one line at a time.</p>,
      },
      {
        id: 'activity',
        title: 'Activity',
        body: <p>What the agent did, as milestones in order, with the model calls and raw events one click away.</p>,
      },
      {
        id: 'replay-tab',
        title: 'Replay',
        body: <p>The check as it happened: the pipeline, the path, the sandbox runs and a feed of each step, replayed from the run’s recorded events.</p>,
      },
      {
        id: 'pr',
        title: 'PR comment',
        body: <p>The check and comment Domino would post. Copy as Markdown gives the exact text to paste into a pull request.</p>,
      },
    ],
  },
  {
    id: 'verdicts',
    group: 'Using the console',
    title: 'Verdicts',
    lede: 'Three outcomes, decided by code from the sandbox runs. The model never sets the verdict.',
    sections: [
      {
        id: 'three',
        title: 'The three verdicts',
        body: (
          <ul>
            <li>
              <b>Reproduced failure.</b> The system passed without the change, failed with it, and passed again once it was undone.
            </li>
            <li>
              <b>No failure observed.</b> The change passed the same checks as the system without it, under the conditions tested.
            </li>
            <li>
              <b>Inconclusive.</b> The runs didn’t give the judge enough to decide either way.
            </li>
          </ul>
        ),
      },
      {
        id: 'wording',
        title: 'What a verdict does not say',
        body: (
          <Note>
            “No failure observed” only describes the tests that ran. It is not a promise about production; the report lists what was tested and
            the known limits.
          </Note>
        ),
      },
      {
        id: 'review',
        title: 'The reviewer',
        body: (
          <p>
            A larger Nemotron model checks every claim in the explanation against the evidence and sends it back when something isn’t supported, up to
            two rounds. Its decision is shown next to the explanation; it never changes the verdict.
          </p>
        ),
      },
    ],
  },
  {
    id: 'live-check',
    group: 'Using the console',
    title: 'Live check and Replay',
    lede: 'Watch a pull request while Domino checks it, or replay any past check.',
    sections: [
      {
        id: 'live',
        title: 'Live check',
        body: (
          <p>
            Appears in the sidebar, with a green count, only while the agent is writing a run. It shows the pipeline stages, the dependency path as Domino
            finds it, the sandbox runs and a readable feed of each step, then the result, and keeps the result on screen when the run finishes.
          </p>
        ),
      },
      {
        id: 'replay',
        title: 'Replay',
        body: (
          <p>
            Every report has a Replay tab that plays that run’s recorded events in the same view, in their real order and sped up. Pause it, or replay
            it from the start.
          </p>
        ),
      },
    ],
  },
  {
    id: 'data',
    group: 'Reference',
    title: 'Data and live updates',
    lede: 'Where the console reads runs from, and how it stays current.',
    sections: [
      {
        id: 'files',
        title: 'Run files',
        body: (
          <>
            <p>Each run is a folder the agent writes in the project’s runs folder. The console groups runs into changes by their change ID.</p>
            <Code
              label="Layout"
              lines={[
                '<project runs folder>/',
                '  <run_id>/',
                '    trace.jsonl            # every event, in order',
                '    summary.json           # verdict and counts',
                '    bundle.json            # evidence bundle',
                '    report.md              # the pull request comment',
                '  receipts.jsonl           # Nightshift receipts for every model call',
                '  watch-<owner>-<repo>.json  # the domino watch queue',
              ]}
            />
          </>
        ),
      },
      {
        id: 'api',
        title: 'Live data API',
        body: (
          <>
            <p>The dev server serves the connected project’s runs folder (DOMINO_RUNS_DIR). The console checks the listing every 4 seconds and reloads when a file changes.</p>
            <Code label="Endpoints" lines={['GET api/domino/files          # { version, roots, files }', 'GET api/domino/file?path=…    # one file’s text']} />
            <p>
              Besides each run’s files (including <code>report.md</code>), it serves the folder’s <code>receipts.jsonl</code>, the{' '}
              <code>watch-&lt;owner&gt;-&lt;repo&gt;.json</code> queue that <code>domino watch</code> keeps, and the <code>pr-*.md</code> comments.
            </p>
            <Note>A static build has no live connection, so its console stays empty.</Note>
          </>
        ),
      },
    ],
  },
  {
    id: 'platform',
    group: 'Reference',
    title: 'Platform',
    lede: 'The three systems behind every investigation.',
    sections: [
      {
        id: 'nemotron',
        title: 'NVIDIA Nemotron via Meterless Nightshift',
        body: (
          <>
            <p>Every model call goes through Nightshift, and each receipt names the model that actually answered.</p>
            <ul>
              <li>
                <code>nemotron-3.5-lightning-30b-a3b</code> investigates: follows the path, writes queries, forms hypotheses, picks experiments.
              </li>
              <li>
                <code>nemotron-3-ultra-550b-a55b</code> reviews the explanation against the evidence.
              </li>
            </ul>
            <a className="dx-link-quiet" href={href.underTheHoodAt('nemotron')}>
              Model calls <DIcon name="arrow-right" size={12} />
            </a>
          </>
        ),
      },
      {
        id: 'zetaris',
        title: 'Zetaris semantic layer',
        body: (
          <>
            <p>Joins the separate systems into one view the agent queries with a read-only login. Every row it relies on is cited as evidence.</p>
            <a className="dx-link-quiet" href={href.underTheHoodAt('zetaris')}>
              Semantic layer <DIcon name="arrow-right" size={12} />
            </a>
          </>
        ),
      },
      {
        id: 'world-model',
        title: 'Meterless World Model',
        body: (
          <>
            <p>Holds the investigation’s state with provenance. The verdict’s cause chain is built by walking it.</p>
            <a className="dx-link-quiet" href={href.underTheHoodAt('meterless')}>
              World Model <DIcon name="arrow-right" size={12} />
            </a>
          </>
        ),
      },
    ],
  },
  {
    id: 'cli',
    group: 'Reference',
    title: 'Command line',
    lede: 'Run Domino from your terminal with the domino command.',
    sections: [
      {
        id: 'install',
        title: 'Install',
        body: (
          <>
            <p>
              Link the agent once and <code>domino</code> works from any folder. <code>domino doctor</code> checks everything a live run needs: Node,
              Python, the data layer and its read-only Zetaris login, Nightshift with a real Nemotron call, and the GitHub CLI.
            </p>
            <Code lines={['cd agent && npm install && npm link', 'domino doctor']} />
            <Note>
              Use <code>domino</code> after linking. <code>npx domino</code> downloads an unrelated package from npm.
            </Note>
          </>
        ),
      },
      {
        id: 'projects',
        title: 'Add a project',
        body: (
          <>
            <p>
              A project is a repository Domino watches. Every new commit on every open pull request is checked, and its runs appear in the console under
              the project switcher at the top of the sidebar, with the queue of pull requests still waiting.
            </p>
            <Code lines={['domino watch --repo owner/name          # check every open pull request', 'domino dashboard --open                 # the console, on the same runs']} />
            <Note>
              Without <code>--post</code>, nothing reaches GitHub; the comment is written to the run’s <code>report.md</code> and shown in its PR comment
              tab. Add <code>--post</code> to post it on the pull request.
            </Note>
          </>
        ),
      },
      {
        id: 'commands',
        title: 'Commands',
        body: (
          <Code
            label="Reference"
            lines={[
              'domino doctor                                # check the setup',
              'domino run --change <world-id>               # one live investigation into agent/runs/live',
              'domino dashboard [--port 5173] [--open]      # the console, watching agent/runs/live',
              'domino pr <n> --repo owner/name [--post]     # check one pull request',
              'domino watch --repo owner/name [--post]      # check every new commit on every open pull request',
              'domino replay <cassette.json>                # replay one recording, no keys or services',
              'domino demo                                  # replay the bundled recordings',
            ]}
          />
        ),
      },
      {
        id: 'exit-codes',
        title: 'Exit codes',
        body: (
          <>
            <p>For CI: add <code>--fail-on-break</code> to make a reproduced failure fail the job.</p>
            <ul className="dx-doc-steps">
              <li>
                <code>0</code> finished
              </li>
              <li>
                <code>1</code> failure reproduced (with <code>--fail-on-break</code>)
              </li>
              <li>
                <code>2</code> error
              </li>
              <li>
                <code>3</code> outage or inconclusive
              </li>
            </ul>
          </>
        ),
      },
    ],
  },
]

/** Highlights the section in view, for "On this page". */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    setActive(ids[0])
    const els = ids.map((id) => document.getElementById(`doc-${id}`)).filter((e): e is HTMLElement => !!e)
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id.replace(/^doc-/, ''))
      },
      { rootMargin: '-80px 0px -60% 0px' },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [ids.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  return [active, setActive] as const
}

export function Docs({ page }: { page: string | null }) {
  const current = PAGES.find((p) => p.id === page) ?? PAGES[0]
  const i = PAGES.indexOf(current)
  const prev = PAGES[i - 1]
  const next = PAGES[i + 1]
  const [active, setActive] = useActiveSection(current.sections.map((s) => s.id))
  const articleRef = useRef<HTMLElement>(null)
  const groups = [...new Set(PAGES.map((p) => p.group))]

  const jump = (id: string) => {
    setActive(id)
    document.getElementById(`doc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="dx-docs">
      <nav className="dx-docs-nav" aria-label="Documentation">
        {groups.map((g) => (
          <div key={g}>
            <div className="dx-docs-group">{g}</div>
            {PAGES.filter((p) => p.group === g).map((p) => (
              <a key={p.id} href={href.docs(p.id)} aria-current={p.id === current.id ? 'page' : undefined}>
                {p.title}
              </a>
            ))}
          </div>
        ))}
      </nav>

      <article className="dx-docs-article" ref={articleRef}>
        <div className="dx-docs-crumb">{current.group}</div>
        <h1>{current.title}</h1>
        <p className="dx-docs-lede">{current.lede}</p>
        {current.sections.map((s) => (
          <section key={s.id} id={`doc-${s.id}`} className="dx-docs-section">
            <h2>{s.title}</h2>
            {s.body}
          </section>
        ))}
        <div className="dx-docs-pager">
          {prev ? (
            <a href={href.docs(prev.id)}>
              <span>Previous</span>
              <b>
                <DIcon name="arrow-left" size={13} /> {prev.title}
              </b>
            </a>
          ) : (
            <span />
          )}
          {next && (
            <a href={href.docs(next.id)} className="is-next">
              <span>Next</span>
              <b>
                {next.title} <DIcon name="arrow-right" size={13} />
              </b>
            </a>
          )}
        </div>
      </article>

      <aside className="dx-docs-toc" aria-label="On this page">
        <div className="dx-docs-group">On this page</div>
        {current.sections.map((s) => (
          <button key={s.id} type="button" aria-current={active === s.id ? 'true' : undefined} onClick={() => jump(s.id)}>
            {s.title}
          </button>
        ))}
      </aside>
    </div>
  )
}

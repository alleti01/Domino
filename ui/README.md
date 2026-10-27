# Domino dashboard (UI)

The website people use to read Domino investigations. The landing page reads saved runs from `../samples/`; the console shows only runs from a connected project and is empty until one is connected.

```bash
cd ui
npm install
npm run dev      # http://localhost:5173
npm test         # parser and converter tests
npm run build    # static build in ui/dist; open from any folder or static host
```

## Pages
The landing page (`#/`, `#/try`) sells; the console proves. The console (`src/dash/`) is laid out like an infrastructure console (grouped sidebar, breadcrumb bar, summary strips, dense tables, detail rails) in the landing page's palette, with colour used only for status. Every figure is computed from the loaded runs.

| URL | Page |
|---|---|
| `#/` | Landing page (see below) |
| `#/try` | Try it yourself (step-by-step replay) |
| `#/overview` | Console home: key numbers, every change with its latest verdict and repeat agreement, recent runs, verdict mix, model routing, what needs attention |
| `#/cases` | Investigations: one row per change; filter by latest verdict or "needs attention", search, sort; deciding measurement and review status per row |
| `#/live` | Live check: a pull request while Domino checks it. In the sidebar only while a run is being written |
| `#/docs`, `#/changelog` | Documentation and changelog |
| `#/runs` | Every saved run, newest first; filter by result and mode |
| `#/cases/<case_id>[?run=<run_id>]` | Investigation report, Summary tab: the verdict once, the deciding measurement as bars against the limit, three trust checks (repeats agree, explanation reviewed, model calls on Nemotron), the path as a short strip, and the evidence, full explanation, reviewer findings and scope collapsed one click away |
| `…?section=replay` | Replay: the check as it happened (pipeline, path, sandbox runs, feed, result), from the run's recorded events, with pause and replay |
| `…?section=evidence` | Dependency map (top-to-bottom, verdict path or full context, selectable), links table, data-quality findings, hypotheses, and the change with its diff |
| `…?section=experiments` | Baseline / candidate / reverted on aligned rows with plain-language names, then each sandbox run with rationale, checks, logs, artifacts and its reproduce command |
| `…?section=activity` | Every model call with its Nightshift receipt, every trace event, errors, World Model memory operations |
| `#/cases/<case_id>/pr` | PR comment preview (nothing is posted) |
| `#/results` | Recorded outcomes per repeat, measured metrics (once the scorecard is exported), comparison with simpler methods |
| `#/under-the-hood?section=nemotron\|zetaris\|meterless` | Platform: model calls by model and by run; semantic layer sources and rows cited (plus sources, USL and DQ once `zetaris.json` exists); World Model operations |
| any page + `&evidence=<id>` | Evidence drawer for that ID in the run on screen; Esc or Back closes it |

Older `?section=` names still land on the right tab: `path`, `context`, `chain`, `change`, `hypotheses` → evidence; `models`, `receipts`, `timeline`, `audit`, `trace` → activity; `verdict` → summary. Search everything with ⌘K or `/`. Explanations of how things work sit behind ⓘ icons instead of in the page.

## Live data
The dev server has a small data API (`vite.config.ts`). The console reads only a connected project's runs folder, set with `DOMINO_RUNS_DIR`, and polls it every 4 s: a run that changes on disk updates without a reload, and a trace still being written shows as in progress. With no project connected, every console page shows its empty state. The npx command will set this up; until then:

```bash
DOMINO_RUNS_DIR=/path/to/project/runs npm run dev
```

A static build has no live connection, so its console is empty.

## Landing page scene
The opening of `#/` is one 3D object (`src/components/landing/story/`, React Three Fiber on three.js, geometry built in code, no model files): the flagship saved run's dependency path as domino-shaped components standing on a plinth, the proposed change in ivory at the front. It unfolds into the connected path, closes in on the inferred link, runs baseline / candidate / control in a sandbox, and re-forms with the component that broke laid beside it. Every name, link, measurement and run comes from that run (the first case that reproduced a failure); the arrangement itself is illustrative and the page says so.

- **Text first, detail in the report:** each chapter is one headline, one plain sentence, at most one proof element (sources, the testable question, baseline / candidate / control, the verdict) and one link into the matching report section. Full identifiers, source rows, raw hypotheses, every run (including repeats), receipts and limits stay in the report, Results and Under the hood. Below 900px wide or in portrait, the copy scrolls up beneath the pinned object on a dark sheet.
- **Loaded lazily:** the scene is its own chunk (about 250 kB gzipped); the page renders without waiting for it and stops rendering it once it's off screen.
- **Fallbacks:** without WebGL, or if the scene fails to start, a still composition of the assembled object stands in and every chapter still reads in full. With reduced motion, each chapter holds its finished state instead of animating.

## Data
Formats are in [`docs/data-formats.md`](../docs/data-formats.md). The investigation trace is Abhi's agent contract (v0.1.0).

```
samples/runs/<run_id>/trace.jsonl   →  src/data/parse.ts    validate, with file/line/field in every error
samples/runs/<run_id>/summary.json  →  src/data/adapter.ts  convert to the view model in src/types.ts
samples/runs/<run_id>/bundle.json   →  src/data/load.ts     find runs, group them into cases; a broken run only breaks that run
samples/manifest.json, scorecard.json, zetaris.json, receipts.jsonl (all optional)
```

- `samples/` feeds the landing page only. The console never reads it.
- There is no placeholder or sample data: with no saved runs the console shows its empty state.
- `fixtures/agent-v0.1/` holds Abhi's two early stub-world runs. Only the tests read them; the app never shows them.

## Checks
- `npm test`: parser and converter against Abhi's real traces, plus wording rules (the UI's own text never claims "safe", "verified", "guaranteed" or "prevents").
- `npm run check:secrets`: scans `../samples`, `fixtures` and `src` for keys and tokens. It also runs before every build, and the build fails if it finds one.
- If the model's own text overclaims (for example a headline saying a change "is safe"), the report shows it as written with a note.

## Wording rules
The only verdicts shown are *Reproduced failure*, *No failure observed under these tests* and *Inconclusive*. They're defined in `src/lib/labels.ts`, and the parser rejects any other value. Status is always shown as an icon plus text, never colour alone.

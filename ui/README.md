# Domino dashboard (UI)

The website people use to read a Domino investigation. It's static: it reads saved runs from `../samples/` and needs no keys, database or server.

```bash
cd ui
npm install
npm run dev      # http://localhost:5173
npm test         # parser and converter tests
npm run build    # static build in ui/dist; open from any folder or static host
```

## Pages
| URL | Page |
|---|---|
| `#/` | Landing page: hero and four chapters around one 3D object built from a saved run (connect the facts → find the assumption → test it and revert it → inspect the result), then two contrasting outcomes, a "Built with" strip linking to the sponsor proof, a short FAQ (verdict meanings, who decides, synthetic data, running it locally) and the call to action |
| `#/try` | Try it yourself (step-by-step replay: next build step) |
| `#/cases` | Investigations: a catalog of framed panels, one per case, each with its change, latest verdict, a miniature of that run's real dependency graph (the verdict's path picked out), its deciding baseline/candidate/control reading, runs and Inspect / PR preview; search and filter by latest verdict |
| `#/cases/<case_id>` | Report for the case's latest run, opening on the Summary tab: readouts (verdict and judge rule, sandbox runs, execution, explanation review), the dependency map with its inspector, the experiment instrument, then the model's attributed explanation, what remains uncertain and any unverified mitigation |
| `#/cases/<case_id>?run=<run_id>` | Report for a specific run (also reachable from the run switcher in the report header) |
| `#/cases/<case_id>?section=<tab>` | One report tab: `context` (change and dependency path), `hypotheses`, `experiments`, `audit` (event timeline). Older section links still work and open the tab that holds them: `change`, `chain` → context; `verdict` → summary; `trace`, `receipts` → audit trail |
| `#/cases/<case_id>/pr` | PR preview: the same run as the check and comment Domino would post (nothing is posted) |
| `#/results` | Results, kept in four groups: recorded outcomes, published expected verdicts, measured metrics, and comparisons with simpler methods (each shows a pending state until it has data). `?section=outcomes`, `expected`, `metrics` or `baselines` scrolls to one |
| `#/under-the-hood` | System proof, one tab per sponsor technology with its role and recorded proof: `?section=nemotron` (receipt log via Nightshift, the default), `zetaris` (queries, rows cited, sources/USL/data quality once exported), `meterless` (World Model reads, writes and updates) |
| any report + `&evidence=<id>` | Opens that evidence in the inspector (docked beside the report from 1280px, a dialog below that; Escape closes it). IDs belong to the run being shown, e.g. `evidence=e7%23B-002` |

Evidence IDs (`e7`, or `e7#B-002` for one Zetaris row) are only unique within a run, so evidence links always sit on a case/run URL.

## Dashboard visuals
- **Dependency map** (`components/report/DependencyMap.tsx`, layout in `lib/graph.ts`): the semantic-layer graph around the change, in columns by dependency depth with the verdict's path along the middle row. Observed links are solid, inferred dashed, unresolved dotted; the change is the ivory tile. Selecting a component or link highlights its connections and shows its source rows beside the map. *Path / Full context* and *Map / List* switch what is drawn and how; narrow screens start on the path as one column. With no path in the verdict, nothing is drawn as a failure path.
- **3D view** (`components/report/Graph3D.tsx`, lazy-loaded; placement in `lib/graph.ts`): the same graph as domino tiles on a reference grid, columns by dependency depth, the verdict's path on the front lane and context in lanes behind and in front. It is the default on wide screens when WebGL works; phones start on 2D. Fit, focus, reset, rotate and zoom buttons; drag rotates within bounds, the wheel scrolls the page. Labels are HTML buttons, so they stay readable and keyboard-selectable. It renders only on demand, stops offscreen, and falls back to 2D with a notice if WebGL is missing or the context is lost. 3D, 2D, List and the inspector share one selection.
- **Follow path**: steps through the verdict's links with their status and cited rows; inferred links stay dashed, unresolved ones stop at a marked gap. Labelled as an illustration of a saved run. Play is off under reduced motion.
- **Recorded experiment** (Summary): choosing a run in the instrument or beside the map shows its checks and observations in both. The saved runs don't tie checks to components, so no component is marked as failing.
- **Experiment instrument** (`components/report/Instrument.tsx`): every sandbox run on one aligned scale for a chosen observation, beside each check's pass/fail and the run's outcome. Missing arms are shown as not recorded; the cited limit is listed, not drawn.

In dev builds, the top bar has a **Dev** control (hidden in production) that shows the loading, empty, error and run-in-progress states.

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

- **To show real runs, copy the agent's `runs/<run_id>/` folders into `samples/runs/`.** No other step is needed. Restart `npm run dev` if `samples/` didn't exist when it started.
- Until any run exists, the site shows built-in placeholders (`src/data/placeholder.ts`). They're in the real trace format and labelled on screen as not being Domino results.
- In dev builds, **Preview UI state → Agent sample runs** shows Abhi's two real sample runs (`fixtures/agent-v0.1/`, a stub world). They're used by the tests and never included in a production build.

## Checks
- `npm test`: parser and converter against Abhi's real traces, plus wording rules (the UI's own text never claims "safe", "verified", "guaranteed" or "prevents").
- `npm run check:secrets`: scans `../samples`, `fixtures` and `src` for keys and tokens. It also runs before every build, and the build fails if it finds one.
- If the model's own text overclaims (for example a headline saying a change "is safe"), the report shows it as written with a note.

## Wording rules
The only verdicts shown are *Reproduced failure*, *No failure observed under these tests* and *Inconclusive*. They're defined in `src/lib/labels.ts`, and the parser rejects any other value. Status is always shown as an icon plus text, never colour alone.

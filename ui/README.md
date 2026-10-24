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
| `#/` | Landing page: one-liner, Try it yourself, Watch demo, live preview of a run, problem, how it works, cases, proof, demo, final call to action |
| `#/try` | Try it yourself (step-by-step replay: next build step) |
| `#/cases` | Dashboard overview: every case and what the verdicts mean |
| `#/cases/<case_id>` | Report for the case's latest run |
| `#/cases/<case_id>?run=<run_id>` | Report for a specific run (also reachable from the run picker) |
| `#/cases/<case_id>?section=chain` | Report scrolled to one section (`change`, `chain`, `hypotheses`, `experiments`, `verdict`, `receipts`, `trace`) |
| `#/cases/<case_id>/pr` | The same run as a GitHub check and comment |
| `#/results` | Scorecard and results by case |
| `#/under-the-hood` | Sponsor proof: Nemotron receipt log across all runs, Zetaris sources/USL/data quality, Meterless memory across runs |
| any page + `&evidence=<id>` | Opens that evidence in the side panel, e.g. `evidence=e7%23B-002` |

Evidence IDs (`e7`, or `e7#B-002` for one Zetaris row) are only unique within a run, so evidence links always sit on a case/run URL.

In dev builds, the sidebar has a **Preview UI state** control that shows the loading, empty, error and run-in-progress states.

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

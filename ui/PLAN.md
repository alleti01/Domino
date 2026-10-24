# Dashboard build plan

Site structure: Home → Case → Runs → Run report (Investigation | PR view), plus Results and Under the hood. An evidence side panel opens from any page, and every page reads from one manifest of saved trace files.

Deadline: **Tue 27 Oct, 23:45 UTC**. Full submission **Mon 26 Oct night**. Tuesday is polish only.

Design and extra features come after the structure works (Phase 6).

---

## Phase 0: Lock the contracts (Fri 23, tonight)
Nothing else is safe to build until the data shapes are agreed.

- [x] **Trace format with Abhi.** Propose it; don't wait for him to invent it. It needs:
  - `case_id`, `run_id`, `started_at`, `mode` (live or replay), `schema_version`
  - the change: summary statements with file and line references
  - Zetaris queries: query text or ID, source, returned **row IDs**
  - chain links: from, to, relation, observed/inferred, source and row IDs
  - hypotheses: status, evidence for/against (each pointing to an **evidence ID**), linked experiments
  - experiments: arms (baseline, candidate, control), metrics, limit or threshold, outcome, log
  - verdict: one of the three values, a one-line headline, key numbers, what was tested, limitations
  - model calls: step, requested model, `routed_model`, `provider_model`, receipt ID, latency, whether the signature was verified
  - Meterless memory events: saved and retrieved, with the ID of the run that saved them
  - every piece of evidence gets a stable ID
- [x] **Manifest format.** A file listing the cases (label, kind, expected verdict), each case's runs, and the path to each trace file.
- [x] **Scorecard format with Anish.** Metrics, results per case, the comparison against simpler methods (plain checks, Nemotron alone, Nemotron with context, full Domino), sample sizes.
- [x] **Zetaris output format with Anish.** Sources onboarded, the compiled USL, data-quality rule results including rejected rows.
- [x] **Where the files live.** For example `samples/manifest.json` and `samples/runs/*.json` at the repo root, written by the agent and read by the UI.
- [ ] **Repo setup.** Commit the scaffold. Agree that `ui/` is mine. Add a root `.gitignore` covering `.env` files and secrets.

## Phase 1: Routing and data layer (Sat 24, morning)
Build the skeleton the whole site hangs on. Still placeholder content.

- [x] Routes: `/`, `/cases/:case`, `?run=<id>`, `/cases/:case/pr`, `/results`, `/under-the-hood`, a not-found page, plus a URL parameter (`?evidence=<id>`) that opens the side panel.
- [x] Types for the manifest, runs, scorecard and Zetaris output, alongside the existing screen types.
- [x] A loader that fetches the manifest, then the run files, then the scorecard. It uses the relative base path so it works when the built site is hosted anywhere.
- [x] **One conversion step** from a raw trace into what the screens need. It is the only place that knows the raw format, so later changes to the format stay small.
- [x] An evidence store built during that conversion (evidence ID → evidence), which the side panel and links use.
- [x] Validation: wrong schema version, missing fields or a broken file show a clear error, never a blank page.
- [x] Convert the current placeholders to the manifest and run format. They stay generic and labelled as placeholders.
- [x] Keep the four UI states (loading, empty, error, run in progress) wired to the new loader.

## Phase 2: Every page in the structure (Sat 24, midday checkpoint)
Checkpoint: the whole site renders end to end on placeholder data.

- [x] **Home:** pitch, how it works in 5 steps with the sponsor behind each, case cards with their latest verdict, the command to run sample mode.
- [x] **Case:** a run picker (latest by default) and a summary across runs ("Reproduced in X of Y runs").
- [x] **Run report:** move the existing sections under the run. Add a header showing which run and how it was produced (live or replay).
- [x] **PR view:** each item links to its section in the report.
- [x] **Results:** metric tiles, a case × verdict matrix, the comparison against simpler methods. Every row links into its report.
- [x] **Under the hood:**
  - receipt log across all runs (the link the README needs for the NVIDIA award);
  - Zetaris: sources, compiled USL, data-quality output with rejected rows;
  - Meterless: memory saved in one run and retrieved in a later one, showing how the plan changed.
- [x] **Evidence side panel:** opens from any row ID, receipt, log or code reference. Controlled by the URL, closes with Esc, keeps keyboard focus inside while open, and returns focus to where it was opened from.
- [x] Sidebar and top navigation updated to the new structure.

## Phase 3: Real data (Sun 25)
Checkpoint: the UI renders real traces from Abhi's agent.

- [x] Point the loader at real trace files and fix the conversion step where the real format differs.
- [ ] Load Anish's real scorecard and Zetaris outputs. *(Waiting: his scorecard only prints a table so far and Zetaris has no structured output yet; formats are in docs/data-formats.md.)*
- [x] **Honesty check:** every claim on screen comes from a trace field. No hard-coded results. Verdict wording comes only from the label file.
- [x] Placeholder banners disappear automatically for real runs and stay for anything still a placeholder.
- [x] Handle gaps in real data (a missing receipt, a failed run, an empty experiment) with the existing pending and empty states.
- [x] **Secrets check on trace files:** a small script that scans for tokens and keys before files are committed.

## Website structure v2: landing page + dashboard (Sat 24 →)
Judges land on a **landing page** first, then go into the **dashboard** for proof. Structure first; the visual design comes after (Phase U). Placeholders stay for everything from Abhi and Anish until their final pushes.

```
#/            Landing: nav · hero (one-liner, Try it yourself, Watch demo, live preview) · problem ·
              how it works · cases · proof · demo video · final "Try it yourself" · footer
#/try         Try it yourself: pick a change → watch Domino investigate it step by step (replayed run)
#/cases       Dashboard overview: all cases, what the verdicts mean
#/cases/…     Run report + PR view (unchanged)
#/results     Results (unchanged)
#/under-the-hood   Sponsor proof (unchanged)
```

**"Try it yourself"** means a guided, interactive replay that needs no keys:
1. Pick one of the cases' pull requests (title + a few diff lines).
2. Press **Run Domino**.
3. Watch the saved investigation play back step by step: change read → Zetaris links → hypotheses → experiments → verdict, with live counters.
4. Land on the verdict, with "Open the full report" and "See the PR comment".

It's clearly labelled as a replay of a saved run. The "run it on your own machine" commands sit next to the final call to action.

### S1: Two layouts and the new routes
- [x] Landing layout (top nav + footer, full width, no sidebar) for `#/` and `#/try`; dashboard layout (sidebar) for everything else.
- [x] Routes: `#/` landing, `#/try`, `#/cases` overview; `?section=` scrolls to a landing section, as it already does for reports.
- [x] Links between them: landing nav → "Open the dashboard"; dashboard sidebar logo → landing; breadcrumbs start at "Overview" (`#/cases`).
- [x] One config file for the repo URL and the demo video URL (empty until the video exists).

### S2: Landing page sections
- [x] Nav: logo · How it works · Cases · Proof · Demo · GitHub · **Open the dashboard**.
- [x] Hero: one-liner, one sentence, **Try it yourself** (primary) + **Watch demo** (secondary), and a link to browse the dashboard.
- [x] Hero preview window built from the flagship case's latest run: header strip (case, runs, verdict counts, replay), the five steps with ticks on the left, chain + key experiment numbers on the right, verdict callout. Case tabs to switch.
- [x] Problem: the Cloudflare and CrowdStrike mechanisms, labelled as real public incidents we recreate safely, linking to the postmortems.
- [x] How it works (five steps with the sponsor behind each), Cases (cards into the dashboard), Proof strip (numbers computed from saved runs, links to Results and Under the hood).
- [x] Demo section: the video when it exists, otherwise a clear "coming after our first real run" placeholder.
- [x] Final call to action: **Try it yourself** again, plus the run-locally commands.
- [x] Footer: GitHub, team, hackathon and track.
- [x] Move the current Home content into the landing page and the dashboard overview.

### S3: Hero preview animation
- [ ] Steps tick off in order, then the chain fills in and the verdict appears. Plays once, respects reduced motion, can be replayed.

### S4: Try it yourself
- [ ] Change picker, Run button, step-by-step replay driven by the saved trace (speed control, skip to end), live counters, verdict ending with links.
- [ ] Works on placeholders now, and on real runs once they land, with no extra work.

### S5: Structure check
- [ ] Every link and button goes somewhere real. Keyboard and screen reader pass on the new pages. Phone widths. Tests for the new routes.

## Phase U: Visual design (after the structure is finished)
- [ ] U1 Design system: typefaces, colour tokens (ink, warm off-white, one accent; red only for failures), spacing, the domino-tile backdrop.
- [ ] U2 Landing page look: big hero type, floating nav, product window, backdrop, section rhythm.
- [ ] U3 Dashboard look: verdict banner, domino-tile chain, experiment bars against limits, GitHub-faithful PR view.
- [ ] U4 Motion, dark/light polish, final accessibility and responsive pass, demo-recording pass at 1440×900.

## Phase 4: Hosting and reproducibility (Sun 25 – Mon 26)
- [ ] Check that the built site works from any folder and on a static host.
- [ ] Public hosting: GitHub Pages via an Actions workflow, or Vercel. GitHub Pages on a free account needs the repo public, which alleti01 has to do.
- [ ] Add `npm run build` to CI so a broken build gets caught.
- [ ] **Fresh-clone test on a machine that isn't mine:** clone → install → `npm run dev`, with no keys.
- [ ] Make sure deep links work on the hosted site: cases, runs, the PR view, the evidence panel.
- [ ] Hand over the README's UI section: how to run it, how to point it at your own trace files, the receipt log link.

## Phase 5: Quality pass (Mon 26)
- [ ] Accessibility: keyboard-only walkthrough, focus order, landmarks, contrast in both themes, nothing conveyed by colour alone.
- [ ] Phone and tablet widths. No sideways page scroll.
- [ ] Check performance with the largest real trace.
- [ ] **Wording review:** never "safe", "verified" or "prevented". Cases labelled "…-inspired". Limitations visible.
- [ ] Demo-recording pass at 1440×900: each section reads on one screen, and the click path follows the video script.
- [ ] Feature freeze Monday night. Record the video from a real run. Submit.

## Phase 6: Extra features (as time allows, nothing risky on Tue)
- [ ] Ideas from the research: verdict headline with key numbers, change column and limit marker in experiments, a "Ruled out under these tests" list, a live step feed and a hypothesis tree, a shorter PR comment.
- [ ] Live mode: watch a run happen through a small local API from the agent.
- [ ] Show a real PR comment the agent posted on a demo repo.

---

## Needed from teammates
| From | What | By |
|---|---|---|
| Abhi | Agree the trace format, including run IDs, evidence IDs, receipts and Meterless memory events | Fri night |
| Abhi | First real trace file | Sun |
| Anish | Scorecard and Zetaris output formats | Sat |
| Anish | Real scorecard numbers | Sun–Mon |
| alleti01 | Make the repo public; enable Pages if we use it | Mon |

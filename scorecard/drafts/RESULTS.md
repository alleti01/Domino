# Results and limits (template)

> Draft by Anish. Rows A, X and R are real (sample mode, 24 Oct). Rows B–E are filled from the agent's
> `run-worlds` folders with `python3 scorecard/run_scorecard.py --import <folder>`. Re-run all rows on the
> frozen code before submitting.

## What the columns mean
- **Correct:** the verdict matches the label (an agent crash counts as wrong).
- **Caught / false alarms:** dangerous changes flagged, and safe changes wrongly flagged.
- **Cause:** for dangerous changes, how much of the real mechanism the explanation names. A keyword proxy.
- **Backed:** the verdict came from the judge's experiments, not a model's guess.
- **Unavailable:** model outages. Left out of the score and reported separately.

## Scorecard: practice worlds (10 cases) / unseen world (4 cases)

| Mode | What it is | Correct | Caught | False alarms | Cause | Backed | Time | Model calls |
|---|---|---|---|---|---|---|---|---|
| A | static diff rules, no data | 6/10 · 2/4 | 3/5 · 2/2 | 2/5 · 2/2 | 0% · 0% | 0/5 · 0/4 | 0.0 s | 0 |
| X | experiments only, no reasoning | 10/10 · 4/4 | 5/5 · 2/2 | 0/5 · 0/2 | 0% · 0% | 5/5 · 2/2 | 0.6 s | 0 |
| R | scripted reference investigator | 10/10 · 4/4 | 5/5 · 2/2 | 0/5 · 0/2 | 50% · 0% | 5/5 · 2/2 | 0.6 s | 0 |
| B | agent, no tools | TODO | | | | | | |
| C | agent, no experiments | TODO | | | | | | |
| E | agent, no USL | TODO | | | | | | |
| **D** | **Domino (full)** | TODO | | | | | | |

**What to read from it (fill in once B–E are in):**
- A vs X: rules alone miss failures and raise false alarms; experiments fix both, but explain nothing.
- R: a scripted walk explains a fixed world's mechanism, and doesn't carry over to a new one.
- D vs C: TODO, what experiments add to the model.
- D vs E: TODO, what the USL adds.
- D on the unseen world: TODO.

## Limits (be honest)
- **Small test set:** 14 cases in 3 worlds, all synthetic. Good for showing the method, not for a general accuracy claim.
- **The cause score is a keyword proxy,** checked against the labels' mechanism words. A human read is the real test.
- **Experiments run in toy engines,** small programs that copy the shape of real failures, not production systems.
- **Live Zetaris runs on a laptop** under Rosetta: 0.2–3 s per query, 5–7 s for the first after a restart.
- **Sample mode answers from saved snapshots:** only the paths we recorded are available offline.
- **Model variance:** agent rows are TODO runs per case; report the spread, not only the best run.
- TODO (Abhi): reviewer catch rate on planted errors; outage count during the scored runs.

# Results and limits (draft)

> Draft by Anish. All rows are real: live Zetaris, 25 Oct 2026, agent at Abhi's commit `03018bf`, Nemotron
> via Meterless Nightshift, graded against the private labels with `scorecard/run_scorecard.py --import`.
> The unseen-world column for the agent modes is filled by the official World 3 run at the freeze.
> Re-run all rows on the frozen code before submitting.

## What the columns mean
- **Correct:** the verdict matches the label (an agent crash counts as wrong).
- **Caught / false alarms:** dangerous changes flagged, and safe changes wrongly flagged.
- **Cause:** for dangerous changes, how much of the real mechanism the explanation names. A keyword proxy.
- **Backed:** warnings the judge confirmed with experiments (baseline pass, candidate fails twice, control pass), not a model's guess.
- **Scored:** runs that finished. Model outages (NVIDIA free-tier limits) are left out of the score and listed separately.

## Scorecard: the 10 practice cases (5 that break, 5 safe)

| Mode | What it is | Correct | Caught | False alarms | Cause | Backed | Time / case | Model calls |
|---|---|---|---|---|---|---|---|---|
| A | static diff rules, no data | 6/10 | 3/5 | 2/5 | 0% | 0/5 | 0.0 s | 0 |
| X | experiments only, no reasoning | 10/10 | 5/5 | 0/5 | 0% | 5/5 | 0.6 s | 0 |
| R | scripted reference investigator | 10/10 | 5/5 | 0/5 | 50% | 5/5 | 2.7 s | 0 |
| B | Nemotron alone, no tools | 2/10 | 0/5 | 0/5 | 13% | – (no warnings) | 51 s | 1 |
| C | Nemotron + Zetaris, no experiments | 2/5 (5 outages) | 2/3 | 1/2 | 56% | 0/3 | 84 s | 16.6 |
| E | Domino without the USL | 10/10 | 5/5 | 0/5 | 23% | 5/5 | 45 s | 12.6 |
| **D** | **Domino (full)** | **10/10** | **5/5** | **0/5** | **43%** | **5/5** | 146 s | 19.8 |

**Unseen world (4 cases, never seen while building the agent):** A 2/4 correct with 2 false alarms;
X 4/4; R 4/4 but 0% cause. **Domino: run at the freeze** (`agent/docs/world3-run-plan.md`).

**What to read from it:**
- **A vs X:** rules alone miss 2 of 5 failures and raise 2 false alarms. Experiments fix both, but explain nothing (0% cause).
- **B:** the model alone never flagged a failure (0/5); it mostly answered "unsure". A model reading a diff can't be trusted to say what breaks.
- **C:** with Zetaris context but no experiments, the model names more of the mechanism (56%), but nothing is confirmed: 1 of 2 safe changes was wrongly flagged, and 5 of 10 runs were lost to outages.
- **D vs C, what experiments add:** every verdict is confirmed by the judge (5/5 backed), with no false alarms.
- **D vs E, what the USL adds:** the same verdicts here, because running the change exposes the failure in these worlds. But Domino names almost twice as much of the cause (43% vs 23%), and its chain cites the source rows behind each link (e.g. 5 cross-source links and 10 evidence rows on w-d2v4, against 2 links and no rows without the USL; Abhi's `agent/docs/comparison-modes.md`).
- **R:** a scripted walk explains the worlds it was written for (50%), and none of the unseen one (0%).
- **D on the unseen world:** at the freeze.

## Limits (be honest)
- **Small test set:** 14 cases in 3 worlds, all synthetic. Good for showing the method, not for a general accuracy claim.
- **Practice cases are not a held-out test.** The agent was built and tuned on these 10 cases. Only the unseen world measures how it does on something new.
- **One run per case (n = 1).** Every run had 0 cache hits, so each is independent, but there are no repeats yet. A second full pass on 24 Oct gave the same verdict on 7 of 7 completed worlds (Abhi's notes).
- **Outages:** the NVIDIA free tier cut 5 of 10 mode-C runs short; they are excluded, not counted as wrong.
- **The cause score is a keyword proxy,** checked against the labels' mechanism words. A human read is the real test.
- **Experiments run in toy engines,** small programs that copy the shape of real failures, not production systems. These worlds take no parameters, so choosing which experiment to run is easy here.
- **Live Zetaris runs on a laptop** under Rosetta: 0.2–3 s per query, 5–7 s for the first after a restart.
- **Sample mode answers from saved snapshots:** only the paths we recorded are available offline.
- **Reviewer:** caught 33 of 33 planted errors after Abhi's checklist fix (24 of 35 before), measured on the same 10 investigations (`agent/docs/reviewer-eval.md`).

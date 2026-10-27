# Ground truth (scorecard only, kept OUT of this repo)

Expected verdicts and true causal chains live in `$DOMINO_PRIVATE_DIR/ground_truth/cases.json`
(default `~/domino-private`), on Anish's machine only. Held-out worlds live in
`$DOMINO_PRIVATE_DIR/worlds/`.

This folder exists only so the path is documented. `.gitignore` blocks everything else here, and
`scorecard/leakage_check.py` fails if a label file is ever tracked by git.
**Agent code must never read the private folder.**

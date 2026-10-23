# Scorecard (Person 1)

Runs every labelled case through modes A–E and reports recall, false alarms on safe cases,
causal correctness, reproduced-backed warnings, runtime and model calls, with sample sizes.
Results with `mode: fake` are rejected. Built in Phase 5.

Ground-truth labels are read from `$DOMINO_PRIVATE_DIR/ground_truth/cases.json` (default `~/domino-private`), never from the repo.
`leakage_check.py` also fails if an answer file is tracked by git or a held-out world ID appears in any tracked file; `pre_push_hook.sh` blocks pushes that would carry either.

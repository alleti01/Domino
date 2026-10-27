# Saved runs the dashboard shows

The dashboard (`ui/`) reads everything in this folder; formats are in `docs/data-formats.md`.

- `runs/<run_id>/`: four live investigations by Abhi's agent (live Zetaris + NVIDIA Nemotron via Meterless
  Nightshift, 24 Oct 2026), copied unchanged from `contracts/agent/samples/runs/` at commit 03018bf.
  All four are released practice worlds with synthetic data, not held-out cases.
- `manifest.json`: names the cases with neutral labels. No expected verdicts: those stay private until the freeze.
- `scorecard.json` and `zetaris.json`: not here yet. Anish's `scorecard/export_site.py --out samples` writes them.

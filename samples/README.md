# Saved runs the dashboard shows

The dashboard (`ui/`) reads everything in this folder; formats are in `docs/data-formats.md`.

- `runs/<run_id>/`: the frozen batch: 30 live investigations by Abhi's agent at commit ab140d5 (live Zetaris +
  NVIDIA Nemotron via Meterless Nightshift, 26–27 Oct 2026), three per released practice world, ten worlds.
  `bundle.json`, `summary.json` and `trace.jsonl` are copied unchanged from `agent/runs/final-full/`.
  Two runs (w-p4r8 and w-r1z5, third repeat) replace runs cut short by a home internet outage; the
  originals and the reason are recorded in that batch's `results.json`. Synthetic data, no held-out cases.
- `manifest.json`: names the cases with neutral labels. No expected verdicts: those stay private until the freeze.
- `scorecard.json` and `zetaris.json`: not here yet. Anish's `scorecard/export_site.py --out samples` writes them.

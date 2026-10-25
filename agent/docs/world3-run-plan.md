# Running the official World 3 (held-out) batch on Anish's Mac

World 3 exists only on Anish's Mac, so the agent runs there. The agent never sees ground truth; it only calls the data layer's CLI. Nothing below names a held-out world.

## 1. Nightshift + Nemotron (≈15 min, Anish)
1. **Install** Nightshift from meterless.ai → install cards → **Mac M1+** (M1–M4 Macs) or **M5+**. Verify the email, install, launch.
   If macOS blocks it: right-click → Open, or System Settings → Privacy & Security → Open Anyway.
2. **NVIDIA key**: build.nvidia.com → profile → API Keys → Generate (`nvapi-…`).
   In Nightshift: **Setup → Providers → NVIDIA**, paste, save.
3. **Lanes**: Lanes (⌘6) → Add lane → "Solve a complex problem" → `nvidia/nemotron-3.5-lightning-30b-a3b` → Duty **Race** → Add.
   Remove or turn off every other lane. The reviewer (`nemotron-3-ultra-550b-a55b`) is called by explicit id and needs no lane; check it appears in the model list.
4. **Preferences → Routing → Cloud first-token limit**: 180 s.

## 2. Agent (≈5 min)
```bash
git fetch origin && git worktree add ../domino-agent origin/abhijandyala   # or the merged branch
cd ../domino-agent/agent && npm install
npm run smoke        # expect: PASS  Nemotron answered through Nightshift
npm test             # offline unit tests
```
The Nightshift token is read automatically from `~/Library/Application Support/ai.meterless.nightshift.m1m4/runtime-token`. For other editions, set `METERLESS_RUNTIME_TOKEN` in `agent/.env` (gitignored).

## 3. Run (≈2.5 min per world per full run)
From `agent/`, with the data layer in live mode and `--repo` pointing at the checkout that has World 3:
```bash
caffeinate -i npx tsx scripts/run-worlds.ts --repo <path-to-anishalleti-checkout> --worlds <W3 ids, comma-separated> --mode full
caffeinate -i npx tsx scripts/run-worlds.ts --repo <…> --worlds <…> --mode no_usl
caffeinate -i npx tsx scripts/run-worlds.ts --repo <…> --worlds <…> --mode no_experiments
caffeinate -i npx tsx scripts/run-worlds.ts --repo <…> --worlds <…> --mode no_tools
```
- Run each mode twice for repeats. Every row in `results.json` carries `mode`, `run_id`, `cache_hits` and `model_failures`.
- Grade with `python3 scorecard/run_scorecard.py --import agent/runs/worlds/<mode>-<stamp> …`.
- **Keep the Mac awake and online** (`caffeinate`, lid open, charger in). Sleep or Wi-Fi drops show up as outages, and they are retried once after a 2-minute cool-down.
- NVIDIA's free tier can return empty completions after many calls. Those are recorded as outages, never as answers.

## 4. Leakage rules
- Result folders contain held-out world ids, so **never commit `agent/runs/`**. It is gitignored, and the pre-push guard also blocks held-out ids.
- The agent reads only the data layer's CLI output. It never opens `ground_truth/`, `~/domino-private`, `worlds/demo_view.py`, `runs/demo_views/` or `runs/site_data/`.

## Fallback if Nightshift can't run on Anish's Mac
Before Monday's freeze, decide together whether World 3 may be loaded into the Zetaris on Abhi's Mac (which has Nightshift and the agent). That breaks the "World 3 only on one machine" isolation, so it is Anish's call.

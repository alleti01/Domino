# For judges (draft)

> Draft by Anish for Adhvik to fold into the main README. Commands are tested; numbers marked `TODO` wait on
> the agent's scored runs.

Domino checks a proposed change **before it ships**. It follows the change through data joined across six
source systems in a Zetaris Unified Semantic Layer, forms hypotheses, and only calls a change dangerous when a
real experiment reproduces the failure (baseline passes, the change fails twice, a control passes).

## Try it: three levels, pick one

| Level | Needs | Time | What you see |
|---|---|---|---|
| 1. Replay | Node.js and npm | a few minutes | the real agent code re-running recorded investigations |
| 2. Data layer | Python 3.9+, no packages | a minute | the joined data, experiments and checks the agent uses |
| 3. Full live | Docker (8 GB+ memory), Zetaris, Nightshift with Nemotron | about an hour the first time | everything live, end to end |

### 1. Replay (no keys, no Docker)
```bash
cd agent && npm install && npm run demo
```
The tool gateway, World Model, harness and judge all run again and must reach the recorded verdict. Recorded
model calls are marked `replay: true`.

### 2. Data layer in sample mode (no Zetaris)
Sample mode answers from snapshots saved from the live Zetaris USL, with the same output shape.
```bash
export DOMINO_DATA_MODE=sample
python3 -m data_layer worlds                          # the test worlds
python3 -m data_layer describe w-k7m2                 # what a world's change is
python3 -m data_layer path w-k7m2/change/0042         # the change's dependency path across sources
python3 -m data_layer run w-k7m2 candidate            # run a real experiment (baseline | candidate | control)
python3 -m data_layer tables                          # the USL tables, columns and sources
python3 -I tests/test_data_layer.py && python3 -I tests/test_abuse.py
python3 scorecard/leakage_check.py                    # nothing the agent sees gives away an answer
```

### 3. Full live
1. Install Zetaris (Docker), then `cp .env.example .env` and fill in the Zetaris logins.
2. `python3 zetaris/setup.py`: loads the sources (including a PostgreSQL catalog over JDBC), builds the USL and
   data-quality rules, and grants the agent read-only access. Two UI steps are listed in `zetaris/README.md`.
3. `python3 -m data_layer doctor`, then run the agent with `--data data_layer` (see `agent/README.md`).

### Use your own database
`python3 zetaris/seed_db.py --sql > domino_seed.sql` gives the schema and all synthetic rows as plain SQL
(PostgreSQL, SQLite, MySQL). `--sqlite domino.db` builds a SQLite file directly. `--zetaris-sql` prints the
statements that register your database in Zetaris.

## Where Zetaris does the work
- **One USL over six sources**, including a live PostgreSQL database. `dependency_edge` is the cross-source join,
  built inside Zetaris, with every link labelled observed / inferred / unresolved.
- **Data quality:** 19 key rules generated from the USL, plus 6 custom ones. A planted broken link is caught.
- **Read-only agent user:** sees the USL only; raw sources and writes are refused.
- Details: `zetaris/DATA.md` (the data), `zetaris/REFLECTION.md` (what it saved us, what we'd improve).

## How we kept the test fair
- **A world the agent never saw.** One world (four cases) was built and kept off the repo until the freeze,
  then published with `worlds/publish_world.py`. Row IDs are unchanged by publishing.
- **Answers never in the repo.** Labels live outside it; a pre-push hook and `scorecard/leakage_check.py`
  block answer words and unreleased world IDs.
- **The judge is code, not a model.** Neither Nemotron model can set the verdict.
- Results and limits: `scorecard/drafts/RESULTS.md`.

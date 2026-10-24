# CLAUDE.md: guardrails for coding assistants in this repo

Domino is a GenAI.Works Open Agent Hackathon 2026 entry (Track 1). Read [README.md](README.md) for the product and [contracts/README.md](contracts/README.md) for the data-layer interface. Deadline: Tue 27 Oct 2026, 23:45 UTC.

## 1. No answer leakage (most important)
The agent is only allowed to see the proposed change and the data in Zetaris. If anything else reaches it, the evaluation is worthless.
- **Answers are not in this repo.** Ground-truth labels and held-out worlds live in `$DOMINO_PRIVATE_DIR` (default `~/domino-private`) on Anish's machine only. **Never read, open, grep, summarize or copy anything there** unless you are working on `scorecard/` for Anish, and never move anything from there into the repo.
- **Never look for, ask about or describe the held-out "surprise" world.** If you come across it, stop and tell the user.
- In anything the agent can read (world files, Zetaris tables, columns, paths, descriptions, logs, prompts), use **neutral names**. Never name a root cause, a failure family, an expected verdict or a real incident. No `cloudflare_bug`, no `duplicate_rows_case`.
- Never hardcode incident-specific rules or hints in agent prompts or code. The same logic must handle every world.

## 2. Branches and git
- Each person has a branch: `anishalleti`, `abhijandyala`, `adhvikvala`. Work only on the current user's branch.
- **Never merge into `main`. Never push.** Do either only when the user explicitly says to.
- Never commit secrets, `.env`, large raw data dumps or real personal data.
- Install the push guard once per clone: `cp scorecard/pre_push_hook.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push`. It blocks pushes containing answer files or held-out world IDs. `python3 scorecard/leakage_check.py` must pass before every commit.

## 3. Stay in your area
| Owner | Area |
|---|---|
| Anish | `data_layer/`, `zetaris/`, `worlds/`, `ground_truth/`, `scorecard/`, `contracts/` |
| Abhi | agent: Nemotron via Nightshift, investigation loop, Meterless Engine |
| Adhvik | dashboard UI, README, deck, demo video, submission |

Don't edit another owner's code. If you need a change across that boundary, propose an interface change in `contracts/` and let the owner make it.

## 4. Code conventions
- **Python 3.9, standard library only** in `data_layer/` and `worlds/`, so a fresh clone runs with no installs. Use `from __future__ import annotations`. No `match` statements and no `X | Y` type unions at runtime.
- Every external call has a timeout. Retries are capped (at most 2, only for unavailable/5xx).
- Expected failures come back as a `status` value in the result dict, not as exceptions (see the contract).
- Worlds must be deterministic, offline and fast (seconds). No network access, no real exploits.
- Every Zetaris query goes through `data_layer.zetaris_client`, which writes it to `runs/query_log.jsonl`. Don't bypass it.
- Synthetic data only, labelled as synthetic.
- Never present `fake`-mode or replayed results as live, or round up or invent scorecard numbers.

## 5. Zetaris gotchas
- **Never run `docker compose down -v`.** It wipes the whole installation.
- The agent uses the **read-only non-admin** login. The admin login is for setup scripts only (registering sources, `COMPILE USL`, `ACTIVATE`, `REGISTER/RUN DQ`, grants).
- Send one SQL statement per request with no trailing semicolon. Every value comes back as a string. Exception: a multi-table `COMPILE USL` is sent whole, as one request.
- API tokens often fail with 400 "Not Allowed". Use `POST /api/auth/login` → `idToken` as the Bearer token, plus `X-Org-ID` and a fresh UUID `X-Request-ID` (already handled in `zetaris_client.py`).
- Exported `ZETARIS_*` shell variables override `.env`. Check with `env | grep ZETARIS`.
- File store:
  - `dffs://…` paths resolve under `/home/zetaris/customer-data/<org-id>/file-store/` (not `shared/`); files must be readable by uid 1001. `zetaris/setup.py` handles this.
  - Copy a file in before registering it. Never use `file://`.
  - Use straight quotes only, and `FROM <database>` is required.
  - JSON must be one array per file.
- `lightning.metastore` must exist before `CREATE NAMESPACE lightning.metastore.<name>`.
- Activate each USL table with explicit CASTs.
- **Rebuilding a USL gives it a new ID: re-run the non-admin grants every time** (`python3 zetaris/setup.py --rebuild-usl` does it).
- Non-admin USL reads need the SQL grant **plus** two UI steps: Permissions → View on Unified Semantic Layer, and the namespace's Access Control → Assign Users.
- A USL foreign key auto-generates a DQ rule, and DQ commands are admin-only.
- REST-API tables re-fetch on every query, so `CACHE TABLE` them. The cache is lost on restart.
- Set non-admin passwords in the UI. Changing them over REST reports success but doesn't work.
- The database catalog is a PostgreSQL datasource (`catalog_db`). Don't `MIN/GROUP BY` it inside the edge `UNION ALL` (Spark planning error); use the `*_refs` tables `setup.py` builds in PostgreSQL. Never print or commit `DOMINO_CATALOG_DB_PASSWORD`.
- Reference docs: https://github.com/zetaris/getting-started (`AGENTS.md`, `docs/guides/zetaris-lightning-sql-companion.md`).

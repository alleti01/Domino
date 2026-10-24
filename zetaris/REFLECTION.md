# Zetaris reflection

What the Unified Semantic Layer did for Domino, where it would help in real work, and what we'd improve.
Written from building it during the hackathon (22–27 Oct 2026); numbers are from our own logs.

## What we built on Zetaris
- **Sources:** nine synthetic tables from six independent source systems, registered as file-store tables in `domino_src`: change records, database catalog, record registry, pipeline repo, service catalog, runtime config, telemetry.
- **USL:** `lightning.metastore.domino.systems`, with 12 tables, canonical IDs (`<system>/<kind>/<name>`) and foreign keys.
- **`dependency_edge`:** the cross-source join, built **inside Zetaris** when it's activated. Every link between two systems is labelled `observed` (two sources agree), `inferred` (one source, or a name-only match) or `unresolved` (it points at nothing), and keeps the source rows it came from.
- **Data quality:** 19 key rules generated from the USL's keys, plus 6 custom rules. One of them, `resolved_link`, catches any link that points at nothing. A planted broken link is caught by three rules at once.
- **Read-only agent:** the investigation agent reads through a non-admin user that can see the USL and nothing else. It is refused on raw sources, other databases and every write.

## How the USL saved time
- **One query instead of a hand-written join per question.** The chain from a code change to the limit it breaks crosses five sources: grant → identity → service → output file → consumer → setting. Without the USL, every investigation would hand-write that multi-way join, and every new world would need new join code. With it, the agent gets the whole chain from **one query** (median about 1.9 s on a laptop) and walks it.
- **New worlds cost data, not code.** Worlds 2 and 3 reused the same generic tables and edge rules; adding a world meant adding rows. The edge logic lives once, in the activation SQL.
- **Data quality came almost free.** Declaring keys gave us 19 checks with no extra code, and the broken-link demo needed one more rule.
- **Provenance by construction.** Because every USL row keeps `source_system` / `source_row_id`, each claim the agent makes cites the exact rows behind it. Its PR report links every step to rows such as `change_records:cr-0004` and `runtime_config:rc-0007`.

## How it would help beyond the hackathon
- **Change review across team boundaries.** The facts that decide whether a change is safe sit with different owners: the DBA's catalog, the platform team's configs, the SRE's monitoring. A USL over them answers "what does this change reach?" without anyone stitching exports together.
- **Pre-merge checks in CI.** A pipeline step could run `dependency_path` on every risky PR and attach the cited chain to the review, with data-quality findings shown rather than silently dropped.
- **Trust in agent answers.** Because the agent reads joined, keyed, quality-checked data, a reviewer can audit its reasoning row by row instead of trusting a model's summary.

## What we would improve in Zetaris
Each of these cost us real time:
1. **Non-admin USL access is split across three places, and one isn't in SQL.** A non-admin user needed the SQL grant **and** "View" on Unified Semantic Layer in Permissions **and** an assignment in the namespace's Access Control dialog, which has no SQL equivalent. The SQL grant succeeded while access was still refused, with no hint about the missing assignment.
2. **The file-store root isn't documented where you need it.** `dffs://` paths resolve under `customer-data/<org-id>/file-store/`, not `shared/`. A table registered against a missing file returns zero rows rather than an error.
3. **`NOT NULL` columns break activation unless wrapped in `COALESCE`.** The error message is excellent (it suggests the exact fix), but a flag to accept known-non-null expressions would avoid wrapping every key column.
4. **API tokens failed with 400 "Not Allowed"** on the hackathon build. We switched to the login token. Changing a non-admin password over REST reported success but didn't take effect.
5. **No query log to show.** We logged every query ourselves (SQL, row IDs, timing) because we couldn't find one in the platform.
6. **Rebuilding a USL issues a new ID,** so grants have to be redone; our setup script re-runs them every time. Keeping access attached to the namespace name would help.
7. **Speed on Apple Silicon.** The images run under Rosetta. Small queries took 0.2–3 s and the first query after a restart 5–7 s. That's fine for this use, but native arm64 images would help interactive agents.

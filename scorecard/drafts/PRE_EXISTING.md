# What existed before 22 Oct vs. built during (draft, Anish's part)

> Draft by Anish for Adhvik's submission note. It covers the data layer, worlds, Zetaris setup and scorecard.
> Abhi and Adhvik add their own sections. Dates come from `git log` (all commits are 23–27 Oct 2026).

## Built during the hackathon (23–27 Oct 2026)
Everything in these folders was written during the event. The first commit is 23 Oct, 18:11 EDT.

| Folder | What it is |
|---|---|
| `data_layer/` | the agent's read-only interface to Zetaris (contract v0.3), sample mode, query log, CLI |
| `worlds/` | the test worlds: engines, case files, experiment runner, publish script |
| `zetaris/` | synthetic source data, USL and data-quality SQL, setup, PostgreSQL catalog, backup and seed scripts, write-ups |
| `scorecard/` | scorecard runner and modes A/X/R, leakage check, repo scan, backup and push-guard scripts |
| `contracts/` | the interface agreed with the agent, and generated samples |
| `practice/` | 10 practice scenarios for building the agent |
| `tests/` | data-layer and abuse tests |

The world mechanisms are modelled on public post-incident reports from well-known outages. The code and
data are our own, synthetic and much smaller. Which report each world follows is kept private until the
held-out world is published at the freeze.

## Pre-existing components we used (not our work)
| Component | Used for | Source |
|---|---|---|
| Zetaris Lightning platform (Docker images, hackathon build) | the USL, data quality, SQL engine | sponsor; downloaded 23 Oct |
| `zetaris/getting-started` docs | setup gotchas and SQL reference | sponsor's public repo |
| PostgreSQL 16 (`postgres:16-alpine` image) | the database-catalog source | open source |
| Alpine Linux image | copying Docker volumes for backup | open source |
| Python 3.9 standard library | everything in our folders; no third-party packages | open source |

No code was copied into these folders from earlier projects.

<!-- Adhvik: add the agent's pre-existing components (e.g. the vendored Meterless World Model, listed in
agent/README.md) and the dashboard's. -->

# What each part of Domino adds (comparison modes, 24 Oct 2026)

All runs: Anish's 10 worlds, live Zetaris, Nemotron via Meterless Nightshift. **Ungraded**: the answer key is private to Anish; agreement below is measured against full Domino's own verdicts, which come from controlled experiments (baseline pass + repeated candidate fail + control pass). Anish's scorecard will grade all modes against ground truth.

| Mode | What the model gets | Can reach a verdict? | Agrees with full Domino |
|---|---|---|---|
| **B** no tools | only the PR diff | no (nothing tested) | **2 / 10** predictions: mostly "unsure" or "safe", including on changes that crash the runtime |
| **C** no experiments | diff + Zetaris semantic layer | no (nothing tested) | **4 / 8** predictions (2 runs lost to provider outages): a coin flip |
| **E** no semantic layer | diff + experiments | yes | **10 / 10** verdicts, but **no evidence-backed "why"** (below) |
| **D** full Domino | diff + Zetaris + experiments + reviewer | yes | reference |

**Why the "why" matters (failure runs):**

| World | Full Domino chain | Without Zetaris |
|---|---|---|
| w-d2v4 | 5 cross-source links, 10 evidence rows | 2 links, 2 refs, no source rows |
| w-g4k8 | 3 links, 5 evidence rows, 5 cited facts | 1 link, no source rows |
| w-k7m2 | 5 links, 9 evidence rows, 6 cited facts | 2 links, no source rows |

**Consistency:** a second full pass on all 10 worlds gave the **same verdict on 7 / 7** worlds that completed (3 lost to NVIDIA returning empty completions after retries, recorded as outages, not answers).

## Honest reading
- Without experiments, the model alone is unreliable (B: 2/10, C: 4/8). The verdict has to come from tests.
- In these worlds, running baseline vs candidate always exposes the failure, so experiments alone (E) reach the same verdict. What Zetaris adds is the **explanation a reviewer can verify**: which grant, which service, which file, which limit, with two independent sources per link. Without it, Domino can say *that* something breaks but not *why*.
- These worlds take no parameters, so choosing *which* experiment to run is trivial here. Worlds where a failure appears only under specific inputs or workloads would test experiment selection, the part of Domino this suite cannot yet measure.

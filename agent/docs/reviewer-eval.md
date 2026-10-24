# Independent reviewer: planted-error evaluation (24 Oct 2026)

**What is tested:** the second Nemotron model (`nvidia/nemotron-3-ultra-550b-a55b`, via Meterless Nightshift) that checks the investigator's explanation and mitigation against the evidence the run retrieved. It never decides the verdict (the deterministic judge does).

**Method:** 10 real investigations (Anish's 10 worlds, live Zetaris + Nemotron, 24 Oct). For each, the exact evidence the run saw is rebuilt from its trace, and the reviewer checks five versions of the explanation:

| Version | Planted error |
|---|---|
| clean | none: the investigator's original text |
| wrong number | one real quantity that appears in the evidence is altered (×1.25 + 3); ids are never touched |
| invented claim | a plausible effect that no evidence supports is appended |
| bad mitigation | the fix is replaced by one that keeps the failing condition (failure cases only) |
| contradicted verdict | the explanation claims the opposite of what the experiments showed |

Script: `scripts/reviewer-eval.ts`. Runs at most 2 reviewer calls at a time.

## Results

| Version | Before (plain approve/reject) | After (checklist + deterministic number check) |
|---|---|---|
| wrong number | 3 / 6 real quantities* | **9 / 9** (6 by the code check, 3 by the model) |
| invented claim | 7 / 10 | **10 / 10** |
| bad mitigation | 2 / 5 | **5 / 5** |
| contradicted verdict | 10 / 10 | **9 / 9** (1 reviewer call unavailable) |
| **planted errors caught** | **24 / 35** | **33 / 33** |
| clean versions approved | 6 / 10 | 7 / 10, and the 3 rejections are real errors in the originals (below) |

\* The first run's mutation sometimes altered ids (e.g. `rule-0291`), which is not a factual error; only real quantities are counted. Fixed in the second run.

**The 3 "clean" rejections were correct.** The investigator's original text was wrong:
- w-d2v4: proposed column-level grants as the fix; the builder reads every column, so entries would still exceed the limit.
- w-g4k8: proposed adding 10 fields to reach 12 inputs; the template contract requires 13.
- w-y6p3: conflated the template's field_count=21 with inputs_supplied=20.

## What changed between the two runs
1. **Deterministic number check** (`src/numbers.ts`): every quantity in the explanation must appear in the evidence or follow from two evidence numbers by +, −, ×, ÷. Ids and units are ignored.
2. **Checklist review**: the reviewer marks each factual claim supported / unsupported / contradicted with its evidence id, and answers "would this mitigation avoid the failure?" with the arithmetic. Approval is computed from the checklist, not taken from a single yes/no.
3. **Less pedantry**: reasonable inferences that follow from the experiments are not flagged.

## Limits
- Same 10 investigations before and after: this shows the improvement on these cases, not a held-out accuracy figure.
- Planted errors are synthetic and one per version; real mistakes can be subtler.
- A reviewer rejection sends the explanation back to the investigator (max 2 rounds); unresolved issues are printed in the report's limits. The verdict itself never depends on the reviewer.

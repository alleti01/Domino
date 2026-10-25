### 🟢 Domino: no failure observed under the tested conditions
**Content update: rule 0291 for template T7**: Rule 0291 for template T7: safe to deploy - partial criteria compatible with 21-field template

The rule-0291 specifies criteria only for f02 and f21, but the system handles this correctly: template-registry declares field_count=21 for T7, rule-validator.validate checks_against template:T7 with field_count=21, and content-interpreter.load_rules evaluates with inputs_supplied=21. Experiments show the new rule passes validation (0 rejections) and the interpreter runs without errors (exit_code 0) even with the partial criteria.

**Experiments** (same workload; only the change differs)
| Variant | rule-validator.rules_checked | rule-validator.rules_rejected | content-pipeline.rules_shipped | content-interpreter.events_processed | content-interpreter.matches | content-interpreter.exit_code | Result |
|---|---|---|---|---|---|---|---|
| baseline | 3 | 0 | 3 | 50 | 0 | 0 | ✅ pass |
| candidate | 4 | 0 | 4 | 50 | 0 | 0 | ✅ pass |
| control (change reverted) | 3 | 0 | 3 | 50 | 0 | 0 | ✅ pass |

**Independent review:** ✓ explanation checked against the evidence by nvidia/nemotron-3-ultra-550b-a55b.

**What was tested:** 3 runs. This is not a claim of production safety.
**Limits:** No test of explicitly passing all 21 fields in the rule criteria; experiments only verified the partial criteria case works within existing norms. · Baseline and candidate both passed under every tested workload.

<sub>Verdict decided by Domino's deterministic judge, not the model. 19 model calls via Meterless Nightshift: nvidia/nemotron-3.5-lightning-30b-a3b ×18, nvidia/nemotron-3-ultra-550b-a55b ×1 (all NVIDIA Nemotron). 7 semantic-layer queries · Meterless World Model: 2 writes, 0 reads, 1 updates · 116s · run run-20261024101547-e9f814</sub>

<details><summary>Reproduce</summary>

```bash
python3 -m data_layer run w-r1z5 baseline
python3 -m data_layer run w-r1z5 candidate
python3 -m data_layer run w-r1z5 control
```
</details>

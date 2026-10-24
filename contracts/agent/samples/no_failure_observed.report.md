### 🟢 Domino: no failure observed under the tested conditions
> Replayed from a recorded run (no live model or data layer).
**Lower tax-api client timeout to 2s**: Tax API timeout reduction to 2s is safe for default workload

The default workload does not exercise tax API calls that take >2s. Both baseline (30s timeout) and candidate (2s timeout) produce 0 timeouts out of 1000 requests. Tax API p99 latency is 1500ms, and the default workload stays within this bound.

**Experiments** (same workload; only the change differs)
| Variant | client.requests | client.timeouts | client.error_rate | Result |
|---|---|---|---|---|
| baseline | 1000 | 0 | 0 | ✅ pass |
| candidate | 1000 | 0 | 0 | ✅ pass |
| control (change reverted) | 1000 | 0 | 0 | ✅ pass |

**What was tested:** 3 runs. This is not a claim of production safety.
**Limits:** Only the default workload was tested. Other workloads or traffic patterns with tax API latency >2s may behave differently. · Baseline and candidate both passed under every tested workload.

<sub>Verdict decided by Domino's deterministic judge, not the model. 15 model calls via Meterless Nightshift: nvidia/nemotron-3.5-lightning-30b-a3b ×15 (all NVIDIA Nemotron). 5 semantic-layer queries · Meterless World Model: 2 writes, 0 reads, 1 updates · 0s · run run-20261024024752-970106</sub>

<details><summary>Reproduce</summary>

```bash
python3 -m practice run p08 baseline
python3 -m practice run p08 candidate
python3 -m practice run p08 control
```
</details>

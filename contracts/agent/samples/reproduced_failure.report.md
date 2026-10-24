### 🟢 Domino: no failure observed under the tested conditions
> Replayed from a recorded run (no live model or data layer).
**Lower tax-api client timeout to 2s**: Tax API timeout reduced to 2s - safe, no increase in timeouts expected

The 2s timeout is sufficient for the observed tax API latency distribution. Tax API p99 latency is 1500ms and max 30d is 1750ms, both well within 2000ms. Experiments with 1000 requests show 0 client.timeouts with both the original 30s and new 2s timeout settings.

**How the change reaches the failure** (joined across sources in the semantic layer)
| # | Link | | Evidence |
|---|---|---|---|
| 1 | h1: Tax API latency (p50=180ms, p99=1500ms, max_30d=1750ms) is well within 2s timeout; experiments confirm 0 timeouts with both timeout settings | observed | `telemetry:tel-0013` service/tax-api.latency_ms_p50 = 180 |
| 2 | h1: Tax API latency (p50=180ms, p99=1500ms, max_30d=1750ms) is well within 2s timeout; experiments confirm 0 timeouts with both timeout settings | observed | `telemetry:tel-0014` service/tax-api.latency_ms_p99 = 1500 |
| 3 | h1: Tax API latency (p50=180ms, p99=1500ms, max_30d=1750ms) is well within 2s timeout; experiments confirm 0 timeouts with both timeout settings | observed | `telemetry:tel-0015` service/tax-api.latency_ms_max_30d = 1750 |

**Experiments** (same workload; only the change differs)
| Variant | client.requests | client.timeouts | client.error_rate | Result |
|---|---|---|---|---|
| baseline | 1000 | 0 | 0 | ✅ pass |
| candidate | 1000 | 0 | 0 | ✅ pass |
| control (change reverted) | 1000 | 0 | 0 | ✅ pass |

**Independent review:** ✓ explanation checked against the evidence by nvidia/nemotron-3-ultra-550b-a55b.

**What was tested:** 3 runs. This is not a claim of production safety.
**Limits:** Latency measurements may not cover all edge cases (e.g. · network spikes · degraded states); real-world traffic patterns may differ from the default workload · Baseline and candidate both passed under every tested workload.

<sub>Verdict decided by Domino's deterministic judge, not the model. 17 model calls via Meterless Nightshift: nvidia/nemotron-3.5-lightning-30b-a3b ×16, nvidia/nemotron-3-ultra-550b-a55b ×1 (all NVIDIA Nemotron). 5 semantic-layer queries · Meterless World Model: 2 writes, 0 reads, 1 updates · 0s · run run-20261024030313-310c97</sub>

<details><summary>Reproduce</summary>

```bash
python3 -m practice run p08 baseline
python3 -m practice run p08 candidate
python3 -m practice run p08 control
```
</details>

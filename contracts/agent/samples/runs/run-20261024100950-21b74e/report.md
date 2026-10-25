### 🟢 Domino: no failure observed under the tested conditions
**Explicit shard grants for svc_bundle_reader**: Explicit shard grants for svc_bundle_reader are safe: bundle size doubles but worker-runtime handles it

The change adds GRANT SELECT ON r0.* to svc_bundle_reader, which causes the bundle-builder to read both default.bundle_fields (99 rows) and r0.bundle_fields (99 rows), doubling the bundle from 99 to 198 entries (3118→6187 bytes). However, worker-runtime exits with code 0 in both baseline and candidate, showing the increased bundle size does not violate any runtime limits.

**Experiments** (same workload; only the change differs)
| Variant | meta-store.rows_visible_to_builder | bundle-builder.entries | bundle-builder.bundle_bytes | worker-runtime.exit_code | worker-runtime.loaded_entries | Result |
|---|---|---|---|---|---|---|
| baseline | 99 | 99 | 3118 | 0 | 99 | ✅ pass |
| candidate | 198 | 198 | 6187 | 0 | 198 | ✅ pass |

**Independent review:** ✓ explanation checked against the evidence by nvidia/nemotron-3-ultra-550b-a55b.

**What was tested:** 2 runs. This is not a claim of production safety.
**Limits:** Could not verify exact value of worker-runtime.max_entries setting; experiments showed runtime handles the doubled bundle size without exit code change · Baseline and candidate both passed under every tested workload.

<sub>Verdict decided by Domino's deterministic judge, not the model. 20 model calls via Meterless Nightshift: nvidia/nemotron-3.5-lightning-30b-a3b ×19, nvidia/nemotron-3-ultra-550b-a55b ×1 (all NVIDIA Nemotron). 8 semantic-layer queries · Meterless World Model: 2 writes, 0 reads, 1 updates · 151s · run run-20261024100950-21b74e</sub>

<details><summary>Reproduce</summary>

```bash
python3 -m data_layer run w-h9c5 baseline
python3 -m data_layer run w-h9c5 candidate
```
</details>

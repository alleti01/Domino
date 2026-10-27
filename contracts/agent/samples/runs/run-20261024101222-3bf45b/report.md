### 🔴 Domino: failure reproduced under tested conditions
**Explicit shard grants for svc_bundle_reader**: Explicit shard grants for svc_bundle_reader breaks worker-runtime - restrict grant to bundle_fields only

The GRANT SELECT ON r0.* TO svc_bundle_reader exposes all tables in the r0 database to the builder, doubling bundle entries from 140 to 280, which exceeds worker-runtime max_entries=200, causing startup failure (exit_code 2).

**How the change reaches the failure** (joined across sources in the semantic layer)
| # | Link | | Evidence |
|---|---|---|---|
| 1 | 0042 grants_to svc_bundle_reader<br><sub>GRANT SELECT ON r0.*</sub> | observed | `change_records:cr-0004` action=GRANT, privilege=SELECT, principal=svc_bundle_reader, database=r0<br>`db_catalog:ag-0010` |
| 2 | svc_bundle_reader identity_of bundle-builder<br><sub>service runs as svc_bundle_reader</sub> | observed | `pipeline_repo:jd-0005`<br>`db_catalog:ag-0010` |
| 3 | bundle-builder writes bundle.json<br><sub>output_mode=as_returned</sub> | observed | `pipeline_repo:jd-0005`<br>`runtime_config:rc-0007` |
| 4 | bundle.json loaded_by worker-runtime<br><sub>read at startup</sub> | observed | `runtime_config:rc-0007`<br>`pipeline_repo:jd-0005` |
| 5 | worker-runtime configured_with worker-runtime.max_entries<br><sub>max_entries=200</sub> | inferred | `runtime_config:rc-0007` |

**Experiments** (same workload; only the change differs)
| Variant | meta-store.rows_visible_to_builder | bundle-builder.entries | bundle-builder.bundle_bytes | worker-runtime.exit_code | worker-runtime.loaded_entries | Result |
|---|---|---|---|---|---|---|
| baseline | 140 | 140 | 4390 | 0 | 140 | ✅ pass |
| candidate | 280 | 280 | 8731 | 2 | 0 | ❌ runtime_starts_with_bundle |
| candidate ·harness | 280 | 280 | 8731 | 2 | 0 | ❌ runtime_starts_with_bundle |
| control (change reverted) ·harness | 140 | 140 | 4390 | 0 | 140 | ✅ pass |

**Independent review:** ✓ explanation checked against the evidence by nvidia/nemotron-3-ultra-550b-a55b.

**Suggested mitigation** (from Nemotron, *not verified by Domino*): Restrict the grant to only the bundle_fields table: `GRANT SELECT ON r0.bundle_fields TO svc_bundle_reader;` instead of `GRANT SELECT ON r0.* TO svc_bundle_reader;`. This keeps the explicit grant mechanism for per-principal query limits and audit logging while limiting access to just the bundle_fields table, preventing the builder from reading other tables in r0 that would double the bundle entries beyond the 200-entry limit.

**What was tested:** 4 runs. 
**Limits:** Mitigation assumes that only bundle_fields needs to be accessible; other tables in r0 may exist that the builder legitimately needs but were previously covered by implicit access. Full impact of restricting to bundle_fields alone would need verification.

<sub>Verdict decided by Domino's deterministic judge, not the model. 21 model calls via Meterless Nightshift: nvidia/nemotron-3.5-lightning-30b-a3b ×20, nvidia/nemotron-3-ultra-550b-a55b ×1 (all NVIDIA Nemotron). 8 semantic-layer queries · Meterless World Model: 3 writes, 1 reads, 2 updates · 91s · run run-20261024101222-3bf45b</sub>

<details><summary>Reproduce</summary>

```bash
python3 -m data_layer run w-k7m2 baseline
python3 -m data_layer run w-k7m2 candidate
python3 -m data_layer run w-k7m2 control
```
</details>

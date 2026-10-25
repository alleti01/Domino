### 🔴 Domino: failure reproduced under tested conditions
> Replayed from a recorded run (no live model or data layer).
**Explicit shard grants for svc_bundle_reader**: Explicit shard grants for svc_bundle_reader breaks worker-runtime startup by exceeding max_entries=200

The GRANT SELECT ON r0.* given to svc_bundle_reader causes the bundle-builder to discover and include metadata from both default.bundle_fields (140 entries) and r0.bundle_fields (140 entries), totaling 280 entries. The worker-runtime is configured with max_entries=200 (runtime_config:rc-0007), so 280 > 200 causes a fatal startup error: "bundle has 280 entries but the runtime preallocates 200; refusing to start"

**How the change reaches the failure** (joined across sources in the semantic layer)
| # | Link | | Evidence |
|---|---|---|---|
| 1 | 0042 grants_to svc_bundle_reader<br><sub>GRANT SELECT ON r0.*</sub> | observed | `change_records:cr-0004`<br>`db_catalog:ag-0010` grant=ag-0010, principal=svc_bundle_reader, database=default, privilege=SELECT |
| 2 | svc_bundle_reader identity_of bundle-builder<br><sub>service runs as svc_bundle_reader</sub> | observed | `pipeline_repo:jd-0005` service_name=bundle-builder, principal=svc_bundle_reader, query=q-bundle-fields, reads_table=bundle_fields, output_artifact=bundle.json, output_mode=as_returned<br>`db_catalog:ag-0010` grant=ag-0010, principal=svc_bundle_reader, database=default, privilege=SELECT |
| 3 | bundle-builder writes bundle.json<br><sub>output_mode=as_returned</sub> | observed | `pipeline_repo:jd-0005` service_name=bundle-builder, principal=svc_bundle_reader, query=q-bundle-fields, reads_table=bundle_fields, output_artifact=bundle.json, output_mode=as_returned<br>`runtime_config:rc-0007` worker-runtime.max_entries = 200 |
| 4 | bundle.json loaded_by worker-runtime<br><sub>read at startup</sub> | observed | `runtime_config:rc-0007` worker-runtime.max_entries = 200<br>`pipeline_repo:jd-0005` service_name=bundle-builder, principal=svc_bundle_reader, query=q-bundle-fields, reads_table=bundle_fields, output_artifact=bundle.json, output_mode=as_returned |
| 5 | worker-runtime configured_with worker-runtime.max_entries<br><sub>max_entries=200</sub> | inferred | `runtime_config:rc-0007` worker-runtime.max_entries = 200 |

**Experiments** (same workload; only the change differs)
| Variant | meta-store.rows_visible_to_builder | bundle-builder.entries | bundle-builder.bundle_bytes | worker-runtime.exit_code | worker-runtime.loaded_entries | Result |
|---|---|---|---|---|---|---|
| baseline | 140 | 140 | 4390 | 0 | 140 | ✅ pass |
| candidate | 280 | 280 | 8731 | 2 | 0 | ❌ runtime_starts_with_bundle |
| candidate ·harness | 280 | 280 | 8731 | 2 | 0 | ❌ runtime_starts_with_bundle |
| control (change reverted) ·harness | 140 | 140 | 4390 | 0 | 140 | ✅ pass |

**Independent review:** ✓ explanation checked against the evidence by nvidia/nemotron-3-ultra-550b-a55b.

**Suggested mitigation** (from Nemotron, *not verified by Domino*): Remove the explicit GRANT SELECT ON r0.* from the change, or reduce worker-runtime.max_entries from 200 to >= 280 (if 280 entries is the intended capacity), or ensure the bundle-builder only queries bundle_fields in one database rather than both default and r0

**What was tested:** 4 runs. 
**Limits:** Could not test per-principal query limit enforcement separately; could not observe audit logging behavior change; only tested default workload

<sub>Verdict decided by Domino's deterministic judge, not the model. 21 model calls via Meterless Nightshift: nvidia/nemotron-3.5-lightning-30b-a3b ×20, nvidia/nemotron-3-ultra-550b-a55b ×1 (all NVIDIA Nemotron). 8 semantic-layer queries · Meterless World Model: 4 writes, 1 reads, 2 updates · 0s · run run-20261024042534-d91dff</sub>

<details><summary>Reproduce</summary>

```bash
python3 -m data_layer run w-k7m2 baseline
python3 -m data_layer run w-k7m2 candidate
python3 -m data_layer run w-k7m2 control
```
</details>

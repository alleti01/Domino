### 🔴 Domino: failure reproduced under tested conditions
> Replayed from a recorded run (no live model or data layer).
**Scale checkout-api to 30 replicas**: Scaling checkout-api to 30 replicas will exceed orders-db max_connections limit

30 replicas × 20 pool_size = 600 total connections > orders-db max_connections = 500, causing 100 connections to be refused

**How the change reaches the failure** (joined across sources in the semantic layer)
| # | Link | | Evidence |
|---|---|---|---|
| 1 | 1310 scales checkout-api | observed | `config_repo:con-0005` service/checkout-api.replicas = 10 |
| 2 | checkout-api connects_to orders-db | observed | `config_repo:con-0006` service/checkout-api.db_pool_size = 20<br>`telemetry:tel-0005` db_pool_size=20 per replica |
| 3 | orders-db configured_with orders-db.max_connections | inferred | `db_catalog:db_-0003` database/orders-db.max_connections = 500 |

**Experiments** (same workload; only the change differs)
| Variant | api.replicas | api.connections_requested | db.connections_refused | Result |
|---|---|---|---|---|
| baseline | 10 | 200 | 0 | ✅ pass |
| candidate | 30 | 600 | 100 | ❌ all_replicas_get_connections |
| candidate ·harness | 30 | 600 | 100 | ❌ all_replicas_get_connections |
| control (change reverted) ·harness | 10 | 200 | 0 | ✅ pass |

**Suggested mitigation** (from Nemotron, *not verified by Domino*): Reduce replicas to 25 (25 × 20 = 500, exactly at the limit) or increase orders-db max_connections to accommodate 600 connections, or reduce db_pool_size per replica (e.g., to 16: 30 × 16 = 480 ≤ 500).

**What was tested:** 4 runs. 
**Limits:** Pool size of 20 per replica is assumed constant; auto-scaling pool behavior not tested

<sub>Verdict decided by Domino's deterministic judge, not the model. 15 model calls via Meterless Nightshift: nvidia/nemotron-3.5-lightning-30b-a3b ×15 (all NVIDIA Nemotron). 6 semantic-layer queries · Meterless World Model: 2 writes, 1 reads, 0 updates · 0s · run run-20261024024752-477fd1</sub>

<details><summary>Reproduce</summary>

```bash
python3 -m practice run p03 baseline
python3 -m practice run p03 candidate
python3 -m practice run p03 control
```
</details>

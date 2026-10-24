"""The 10 practice scenarios. Made up for practice; none is a real system.

Each scenario has:
  describe   what the agent may read about the change (same shape as the real describe_world)
  facts      (source, subject, key, value) rows spread across independent sources
  edges      (from, relation, to, edge_status, [fact indexes used as evidence], detail)
  sim        which simulation runs it and its before/after settings
Expected outcomes are NOT here; they live in answers.json.
"""

from __future__ import annotations

SOURCES = {
    "config_repo": "config_repo",
    "telemetry": "telemetry",
    "code_index": "code_index",
    "db_catalog": "db_catalog",
    "schema_registry": "schema_registry",
}


def _diff(path: str, removed: list, added: list) -> str:
    body = "".join(f"-{line}\n" for line in removed) + "".join(f"+{line}\n" for line in added)
    return f"--- a/{path}\n+++ b/{path}\n@@ -1,{len(removed)} +1,{len(added)} @@\n{body}"


def _change(cid, title, description, path, removed, added):
    return {"change_id": cid, "title": title, "description": description, "files": [path],
            "diff": _diff(path, removed, added)}


SCENARIOS = [
    {
        "id": "p01",
        "title": "Shorter acknowledgement timeout on the payments queue",
        "components": [
            {"name": "payments-queue", "role": "message broker queue for payment requests"},
            {"name": "payment-consumer", "role": "takes payment requests off the queue and charges the card"},
            {"name": "charges-db", "role": "ledger of charges"},
        ],
        "change": _change("1203", "Shorten payments queue ack timeout",
                          "Surface stuck consumers faster by lowering the acknowledgement timeout.",
                          "config/queues/payments.yaml", ["ack_timeout_s: 30"], ["ack_timeout_s: 5"]),
        "facts": [
            ("config_repo", "queue/payments", "ack_timeout_s", "30"),
            ("config_repo", "queue/payments", "delivery", "at_least_once"),
            ("telemetry", "service/payment-consumer", "processing_ms_p50", "3200"),
            ("telemetry", "service/payment-consumer", "processing_ms_p95", "8100"),
            ("code_index", "service/payment-consumer", "idempotency_key", "none"),
            ("db_catalog", "table/charges", "unique_keys", "charge_id"),
        ],
        "edges": [
            ("change/1203", "modifies", "queue/payments", "observed", [0], "ack_timeout_s 30 -> 5"),
            ("queue/payments", "delivers_to", "service/payment-consumer", "observed", [1, 4], "delivery=at_least_once"),
            ("service/payment-consumer", "measured", "metric/payment-consumer.processing", "observed", [2, 3],
             "processing_ms_p50=3200; processing_ms_p95=8100"),
            ("service/payment-consumer", "writes", "table/charges", "inferred", [4, 5],
             "idempotency_key=none; unique_keys=charge_id"),
        ],
        "sim": {"type": "redelivery", "messages": 500, "p50_ms": 3200, "p95_ms": 8100, "idempotent": False,
                "before": {"ack_timeout_ms": 30000}, "after": {"ack_timeout_ms": 5000}},
    },
    {
        "id": "p02",
        "title": "Shorter acknowledgement timeout on the refunds queue",
        "components": [
            {"name": "refunds-queue", "role": "message broker queue for refund requests"},
            {"name": "refund-consumer", "role": "takes refund requests off the queue and refunds the card"},
            {"name": "refunds-db", "role": "ledger of refunds"},
        ],
        "change": _change("1204", "Shorten refunds queue ack timeout",
                          "Surface stuck consumers faster by lowering the acknowledgement timeout.",
                          "config/queues/refunds.yaml", ["ack_timeout_s: 30"], ["ack_timeout_s: 5"]),
        "facts": [
            ("config_repo", "queue/refunds", "ack_timeout_s", "30"),
            ("config_repo", "queue/refunds", "delivery", "at_least_once"),
            ("telemetry", "service/refund-consumer", "processing_ms_p50", "3100"),
            ("telemetry", "service/refund-consumer", "processing_ms_p95", "7900"),
            ("code_index", "service/refund-consumer", "idempotency_key", "message_id"),
            ("db_catalog", "table/processed_messages", "unique_keys", "message_id"),
        ],
        "edges": [
            ("change/1204", "modifies", "queue/refunds", "observed", [0], "ack_timeout_s 30 -> 5"),
            ("queue/refunds", "delivers_to", "service/refund-consumer", "observed", [1, 4], "delivery=at_least_once"),
            ("service/refund-consumer", "measured", "metric/refund-consumer.processing", "observed", [2, 3],
             "processing_ms_p50=3100; processing_ms_p95=7900"),
            ("service/refund-consumer", "writes", "table/processed_messages", "observed", [4, 5],
             "idempotency_key=message_id; unique_keys=message_id"),
        ],
        "sim": {"type": "redelivery", "messages": 500, "p50_ms": 3100, "p95_ms": 7900, "idempotent": True,
                "before": {"ack_timeout_ms": 30000}, "after": {"ack_timeout_ms": 5000}},
    },
    {
        "id": "p03",
        "title": "Scale the checkout API for peak traffic",
        "components": [
            {"name": "checkout-api", "role": "stateless API; each replica keeps a database connection pool"},
            {"name": "orders-db", "role": "primary database for orders"},
        ],
        "change": _change("1310", "Scale checkout-api to 30 replicas",
                          "Triple capacity ahead of the seasonal peak.",
                          "deploy/checkout-api.yaml", ["replicas: 10"], ["replicas: 30"]),
        "facts": [
            ("config_repo", "service/checkout-api", "replicas", "10"),
            ("config_repo", "service/checkout-api", "db_pool_size", "20"),
            ("db_catalog", "database/orders-db", "max_connections", "500"),
            ("telemetry", "database/orders-db", "connections_in_use_p95", "210"),
        ],
        "edges": [
            ("change/1310", "scales", "service/checkout-api", "observed", [0], "replicas 10 -> 30"),
            ("service/checkout-api", "connects_to", "database/orders-db", "observed", [1, 3], "db_pool_size=20 per replica"),
            ("database/orders-db", "configured_with", "setting/orders-db.max_connections", "inferred", [2],
             "max_connections=500"),
        ],
        "sim": {"type": "pool", "pool_size": 20, "max_connections": 500,
                "before": {"replicas": 10}, "after": {"replicas": 30}},
    },
    {
        "id": "p04",
        "title": "Scale the search API for peak traffic",
        "components": [
            {"name": "search-api", "role": "stateless API; each replica keeps a database connection pool"},
            {"name": "catalog-db", "role": "primary database for the product catalog"},
        ],
        "change": _change("1311", "Scale search-api to 24 replicas",
                          "More than double capacity ahead of the seasonal peak.",
                          "deploy/search-api.yaml", ["replicas: 10"], ["replicas: 24"]),
        "facts": [
            ("config_repo", "service/search-api", "replicas", "10"),
            ("config_repo", "service/search-api", "db_pool_size", "20"),
            ("db_catalog", "database/catalog-db", "max_connections", "500"),
            ("telemetry", "database/catalog-db", "connections_in_use_p95", "190"),
        ],
        "edges": [
            ("change/1311", "scales", "service/search-api", "observed", [0], "replicas 10 -> 24"),
            ("service/search-api", "connects_to", "database/catalog-db", "observed", [1, 3], "db_pool_size=20 per replica"),
            ("database/catalog-db", "configured_with", "setting/catalog-db.max_connections", "inferred", [2],
             "max_connections=500"),
        ],
        "sim": {"type": "pool", "pool_size": 20, "max_connections": 500,
                "before": {"replicas": 10}, "after": {"replicas": 24}},
    },
    {
        "id": "p05",
        "title": "Standardise event timestamps",
        "components": [
            {"name": "shipment-events", "role": "publishes shipment events"},
            {"name": "eta-calculator", "role": "consumes shipment events and estimates arrival times"},
        ],
        "change": _change("1422", "Emit ISO-8601 UTC timestamps",
                          "Use one timestamp format across event producers.",
                          "services/shipment-events/settings.py",
                          ['TIMESTAMP_FORMAT = "%Y-%m-%d %H:%M:%S"'], ['TIMESTAMP_FORMAT = "%Y-%m-%dT%H:%M:%SZ"']),
        "facts": [
            ("config_repo", "service/shipment-events", "timestamp_format", "%Y-%m-%d %H:%M:%S"),
            ("schema_registry", "event/shipment_updated", "occurred_at", "string"),
            ("code_index", "service/eta-calculator", "parses_occurred_at_with", "%Y-%m-%d %H:%M:%S"),
            ("telemetry", "service/eta-calculator", "events_per_hour", "12000"),
        ],
        "edges": [
            ("change/1422", "modifies", "service/shipment-events", "observed", [0], "timestamp_format changes"),
            ("service/shipment-events", "publishes", "event/shipment_updated", "observed", [1], "occurred_at as string"),
            ("event/shipment_updated", "consumed_by", "service/eta-calculator", "observed", [1, 2, 3],
             "parses occurred_at with %Y-%m-%d %H:%M:%S"),
        ],
        "sim": {"type": "format", "events": 100, "consumer_format": "%Y-%m-%d %H:%M:%S",
                "before": {"producer_format": "%Y-%m-%d %H:%M:%S"}, "after": {"producer_format": "%Y-%m-%dT%H:%M:%SZ"}},
    },
    {
        "id": "p06",
        "title": "More aggressive client retries",
        "components": [
            {"name": "mobile-gateway", "role": "client of the pricing API"},
            {"name": "pricing-api", "role": "prices carts; sits behind a rate-limited API gateway"},
        ],
        "change": _change("1530", "Retry pricing calls up to 5 times",
                          "Reduce user-visible errors during upstream blips.",
                          "services/mobile-gateway/retry.yaml",
                          ["max_retries: 1", "backoff: exponential"], ["max_retries: 5", "backoff: none"]),
        "facts": [
            ("config_repo", "service/mobile-gateway", "max_retries", "1"),
            ("config_repo", "service/mobile-gateway", "backoff", "exponential"),
            ("telemetry", "service/mobile-gateway", "pricing_rps_p95", "100"),
            ("telemetry", "service/pricing-api", "error_rate_during_daily_brownout", "0.20"),
            ("config_repo", "gateway/pricing", "rate_limit_rps", "120"),
        ],
        "edges": [
            ("change/1530", "modifies", "service/mobile-gateway", "observed", [0, 1], "max_retries 1 -> 5; backoff exponential -> none"),
            ("service/mobile-gateway", "calls", "service/pricing-api", "observed", [2, 3], "pricing_rps_p95=100"),
            ("service/pricing-api", "protected_by", "gateway/pricing", "inferred", [4], "rate_limit_rps=120"),
        ],
        "sim": {"type": "retry", "base_rps": 100, "error_rate": 0.20, "rate_limit_rps": 120,
                "before": {"max_retries": 1, "backoff": True}, "after": {"max_retries": 5, "backoff": False}},
    },
    {
        "id": "p07",
        "title": "Debug logging for the payments service",
        "components": [
            {"name": "payments-service", "role": "writes application logs to the node's local disk"},
            {"name": "log-rotation", "role": "rotates and ships logs off the node on a schedule"},
        ],
        "change": _change("1611", "Turn on debug logging in payments-service",
                          "Needed to investigate an intermittent issue.",
                          "services/payments/logging.yaml", ["level: INFO"], ["level: DEBUG"]),
        "facts": [
            ("config_repo", "service/payments-service", "log_level", "INFO"),
            ("telemetry", "service/payments-service", "log_mb_per_hour_at_info", "400"),
            ("telemetry", "service/payments-service", "debug_volume_multiplier_staging", "6"),
            ("config_repo", "job/log-rotation", "interval_hours", "6"),
            ("telemetry", "node/payments-nodes", "free_disk_mb_p05", "9000"),
        ],
        "edges": [
            ("change/1611", "modifies", "service/payments-service", "observed", [0], "log_level INFO -> DEBUG"),
            ("service/payments-service", "measured", "metric/payments-service.log_volume", "observed", [1, 2],
             "400 MB/h at INFO; DEBUG is 6x in staging"),
            ("service/payments-service", "writes_to", "node/payments-nodes", "inferred", [4], "free_disk_mb_p05=9000"),
            ("node/payments-nodes", "cleaned_by", "job/log-rotation", "inferred", [3], "interval_hours=6"),
        ],
        "sim": {"type": "disk", "info_mb_per_hour": 400, "debug_multiplier": 6, "free_mb": 9000, "rotation_hours": 6,
                "before": {"level": "INFO"}, "after": {"level": "DEBUG"}},
    },
    {
        "id": "p08",
        "title": "Tighter timeout on tax calls",
        "components": [
            {"name": "cart-service", "role": "calls the tax API while building a cart"},
            {"name": "tax-api", "role": "returns tax for a cart"},
        ],
        "change": _change("1702", "Lower tax-api client timeout to 2s",
                          "Fail fast instead of holding threads for 30 seconds.",
                          "services/cart/clients.yaml", ["tax_api_timeout_ms: 30000"], ["tax_api_timeout_ms: 2000"]),
        "facts": [
            ("config_repo", "service/cart-service", "tax_api_timeout_ms", "30000"),
            ("telemetry", "service/tax-api", "latency_ms_p50", "180"),
            ("telemetry", "service/tax-api", "latency_ms_p99", "1500"),
            ("telemetry", "service/tax-api", "latency_ms_max_30d", "1750"),
        ],
        "edges": [
            ("change/1702", "modifies", "service/cart-service", "observed", [0], "tax_api_timeout_ms 30000 -> 2000"),
            ("service/cart-service", "calls", "service/tax-api", "observed", [1, 2, 3],
             "latency_ms_p50=180; p99=1500; max_30d=1750"),
        ],
        "sim": {"type": "timeout", "requests": 1000, "p50_ms": 180, "p99_ms": 1500, "max_ms": 1750,
                "before": {"timeout_ms": 30000}, "after": {"timeout_ms": 2000}},
    },
    {
        "id": "p09",
        "title": "Run the invoice export more often",
        "components": [
            {"name": "invoice-export", "role": "scheduled job that appends new invoices to the accounting system"},
            {"name": "accounting-system", "role": "external ledger that accepts appended invoice batches"},
        ],
        "change": _change("1805", "Run invoice-export every 15 minutes",
                          "Get invoices to accounting faster.",
                          "jobs/invoice-export.cron", ["schedule: 0 * * * *"], ["schedule: */15 * * * *"]),
        "facts": [
            ("config_repo", "job/invoice-export", "schedule", "0 * * * *"),
            ("telemetry", "job/invoice-export", "run_minutes_p50", "22"),
            ("code_index", "job/invoice-export", "run_lock", "none"),
            ("code_index", "job/invoice-export", "selects", "invoices not yet exported at start of run"),
        ],
        "edges": [
            ("change/1805", "modifies", "job/invoice-export", "observed", [0], "schedule hourly -> every 15 min"),
            ("job/invoice-export", "measured", "metric/invoice-export.duration", "observed", [1], "run_minutes_p50=22"),
            ("job/invoice-export", "appends_to", "service/accounting-system", "inferred", [2, 3],
             "run_lock=none; selects invoices not yet exported at start of run"),
        ],
        "sim": {"type": "overlap", "window_minutes": 180, "run_minutes": 22, "has_lock": False,
                "before": {"interval_minutes": 60}, "after": {"interval_minutes": 15}},
    },
    {
        "id": "p10",
        "title": "Add an optional promo code column",
        "components": [
            {"name": "orders-db", "role": "database holding the orders table"},
            {"name": "fulfilment-worker", "role": "reads orders to pick and pack"},
            {"name": "finance-report", "role": "reads orders nightly"},
        ],
        "change": _change("1907", "Add nullable promo_code to orders",
                          "Store the promo code used at checkout. Online, non-blocking migration.",
                          "db/migrations/0911_orders_promo_code.sql", [],
                          ["ALTER TABLE orders ADD COLUMN promo_code VARCHAR(32) NULL;",
                           "CREATE INDEX CONCURRENTLY idx_orders_promo ON orders (promo_code);"]),
        "facts": [
            ("db_catalog", "table/orders", "row_count", "2000000"),
            ("code_index", "service/fulfilment-worker", "reads_orders_with", "explicit column list"),
            ("code_index", "service/finance-report", "reads_orders_with", "explicit column list"),
            ("config_repo", "tool/migrations", "mode", "online, non-blocking"),
        ],
        "edges": [
            ("change/1907", "modifies", "table/orders", "observed", [0, 3], "adds nullable column + concurrent index"),
            ("table/orders", "read_by", "service/fulfilment-worker", "observed", [1], "explicit column list"),
            ("table/orders", "read_by", "service/finance-report", "observed", [2], "explicit column list"),
        ],
        "sim": {"type": "schema_add", "rows": 50, "consumers_use_explicit_columns": True,
                "before": {"has_new_column": False}, "after": {"has_new_column": True}},
    },
]

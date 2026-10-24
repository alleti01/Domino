// Receipts are Domino's evidence that a request was really answered by NVIDIA Nemotron.
// Nightshift attaches a signed receipt to every routed answer; its exact shape is not
// documented, so we keep the raw receipt and pull out the fields we rely on.

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface Receipt {
  schema: string | null; // e.g. "meterless.compute_receipt.v1"
  receiptId: string | null;
  requestId: string | null;
  routedModel: string | null;
  providerModel: string | null;
  reason: string | null;
  /** Every model that touched the request (receipt `phases[].model`). All must be Nemotron for award evidence. */
  phaseModels: string[];
  /** "miss" means a fresh model call; "hit" means Nightshift served a cached answer (not an independent run). */
  cacheStatus: string | null;
  requestedModel: string;
  purpose?: string;
  latencyMs: number;
  attempts: number;
  at: string;
  /** Unmodified receipt payload (body and/or headers), kept for offline signature checks. */
  raw: Record<string, unknown>;
}

const RECEIPT_KEYS = ["meterless_receipt", "receipt", "meterless", "x_meterless"];

function findReceiptObject(json: Record<string, any>): Record<string, any> | undefined {
  for (const key of RECEIPT_KEYS) {
    const value = json[key];
    if (value && typeof value === "object") return value.receipt && typeof value.receipt === "object" ? value.receipt : value;
  }
  return undefined;
}

function pick(obj: Record<string, any> | undefined, ...keys: string[]): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

export function extractReceipt(
  json: Record<string, any>,
  headers: Headers,
  meta: { requestedModel: string; purpose?: string; latencyMs: number; attempts: number },
): Receipt {
  const body = findReceiptObject(json);
  const headerFields: Record<string, string> = {};
  headers.forEach((value, name) => {
    if (name.toLowerCase().startsWith("meterless") || name.toLowerCase().startsWith("x-meterless")) headerFields[name] = value;
  });
  const fromHeader = (suffix: string) =>
    Object.entries(headerFields).find(([name]) => name.toLowerCase().replace(/_/g, "-").endsWith(suffix))?.[1] ?? null;

  // meterless.compute_receipt.v1: winning_route.model / routing.winner / routing.reason / phases[] / cache.status
  const phaseModels = Array.isArray(body?.phases)
    ? body.phases.map((p: any) => (typeof p?.model === "string" ? p.model : null)).filter(Boolean)
    : [];

  return {
    schema: pick(body, "schema"),
    receiptId: pick(body, "receipt_id", "receiptId"),
    requestId: pick(body, "request_id", "requestId", "id") ?? fromHeader("request-id") ?? (typeof json.id === "string" ? json.id : null),
    routedModel:
      pick(body?.winning_route, "model") ??
      pick(body?.routing, "winner") ??
      pick(body, "routed_model", "routedModel") ??
      fromHeader("routed-model"),
    providerModel: pick(body, "provider_model", "providerModel") ?? fromHeader("provider-model") ?? (typeof json.model === "string" ? json.model : null),
    reason: pick(body?.routing, "reason") ?? pick(body, "reason") ?? fromHeader("reason"),
    phaseModels,
    cacheStatus: pick(body?.cache, "status"),
    requestedModel: meta.requestedModel,
    purpose: meta.purpose,
    latencyMs: meta.latencyMs,
    attempts: meta.attempts,
    at: new Date().toISOString(),
    raw: { ...(body ? { body } : {}), ...(Object.keys(headerFields).length ? { headers: headerFields } : {}) },
  };
}

/** True only if the winning model and every phase model is NVIDIA Nemotron. */
export function isNemotron(receipt: Receipt): boolean {
  const models = [receipt.routedModel ?? receipt.providerModel ?? "", ...receipt.phaseModels];
  return models.every((m) => m.toLowerCase().includes("nemotron"));
}

/** Append-only JSONL log of every receipt: the evidence file linked from the README. */
export class ReceiptLog {
  constructor(readonly path: string) {}
  async append(receipt: Receipt): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(receipt)}\n`);
  }
}

// Phase 0 check: is Nightshift reachable, authorised, and answering with Nemotron?
// Usage: npm run smoke

import { existsSync } from "node:fs";
import { autoDetect, NightshiftClient, NightshiftError } from "../src/llm/nightshift.js";
import { ReceiptLog } from "../src/llm/receipts.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const detected = process.env.METERLESS_BASE_URL ? null : await autoDetect();
const client = new NightshiftClient({
  baseUrl: detected?.baseUrl,
  receiptLog: new ReceiptLog("runs/receipts.jsonl"),
});

console.log(`Runtime: ${client.baseUrl}`);
const { status, models } = await client.status();
console.log(`Status:  ${status}`);
if (status !== "online") {
  console.log(
    status === "unauthorized"
      ? "Token rejected. Copy the API key from Nightshift → Console into METERLESS_RUNTIME_TOKEN in .env."
      : "Nightshift is not reachable. Launch it (newest Mac M1+ build) and try again.",
  );
  process.exit(1);
}
console.log(`Modes:   ${models.join(", ")}`);

try {
  const result = await client.chat({
    purpose: "smoke",
    messages: [{ role: "user", content: "Reply with one short sentence confirming this connection works." }],
  });
  const r = result.receipt;
  console.log(`\nAnswer:  ${result.message.content?.trim()}`);
  console.log(`Model:   routed=${r.routedModel ?? "?"} · phases=${r.phaseModels.join(", ") || "?"} · reason=${r.reason ?? "?"}`);
  console.log(`Receipt: ${r.schema ?? "?"} · ${r.receiptId ?? "?"} · cache=${r.cacheStatus ?? "?"}`);
  console.log(`Request: ${r.requestId ?? "?"} · ${result.latencyMs} ms · ${result.attempts} attempt(s) → saved to runs/receipts.jsonl`);
  console.log(r.routedModel?.toLowerCase().includes("nemotron") ? "\nPASS  Nemotron answered through Nightshift" : "\nCHECK receipt did not name a Nemotron model");
} catch (err) {
  const e = err as NightshiftError;
  console.error(`\nFAIL  ${e.kind ?? "error"}: ${e.message}`);
  process.exit(1);
}

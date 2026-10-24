// Does Nightshift honour an explicit model id? Prints the routed model for each request.
import { NightshiftClient } from "../src/llm/nightshift.js";
const models = process.argv.slice(2);
for (const model of models) {
  const client = new NightshiftClient({ model, requireNemotron: false });
  const started = Date.now();
  try {
    const r = await client.chat({ purpose: "pin-check", messages: [{ role: "user", content: 'Reply with JSON only: {"ok": true}' }] });
    console.log(`${model} → routed ${r.receipt.routedModel} · phases ${r.receipt.phaseModels.join(",")} · reason ${r.receipt.reason} · ${Date.now() - started}ms · ${JSON.stringify(r.message.content?.slice(0, 60))}`);
  } catch (e) {
    console.log(`${model} → ERROR ${(e as Error).message.slice(0, 200)}`);
  }
}

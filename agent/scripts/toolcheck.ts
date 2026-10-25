// Phase 0 check: does Nemotron make structured tool calls through Nightshift?
import { NightshiftClient } from "../src/llm/nightshift.js";
import { ReceiptLog } from "../src/llm/receipts.js";

const client = new NightshiftClient({ receiptLog: new ReceiptLog("runs/receipts.jsonl") });
const result = await client.chat({
  purpose: "toolcheck",
  messages: [{ role: "user", content: "How many rows are in the table named grants? Use the tool." }],
  tools: [
    {
      type: "function",
      function: {
        name: "query_usl",
        description: "Run one read-only SQL statement against the semantic layer and return rows.",
        parameters: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] },
      },
    },
  ],
  toolChoice: "auto",
});
console.log("tool_calls:", JSON.stringify(result.message.tool_calls ?? null));
console.log("content:", result.message.content?.slice(0, 200) ?? null);
console.log("model:", result.receipt.routedModel, "·", result.latencyMs, "ms");

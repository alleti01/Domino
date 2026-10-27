import { NightshiftClient } from "../src/llm/nightshift.js";
const client = new NightshiftClient({ model: "nvidia/nemotron-3-ultra-550b-a55b" });
const t = Date.now();
const r = await client.chat({
  purpose: "tool-check",
  messages: [
    { role: "system", content: "You review an investigation's explanation against its evidence. Use the submit_review tool." },
    { role: "user", content: "Evidence: [E1] replicas=30, [E2] pool_size=20 per replica, [E3] max_connections=500, [X1] candidate: connections_requested=600, refused=100.\nExplanation: '30 replicas x 20 = 600 connections, over the 500 limit, so 100 are refused. Also CPU saturates.'\nCheck every statement." },
  ],
  tools: [{ type: "function", function: { name: "submit_review", description: "Submit the review", parameters: { type: "object", properties: { approved: { type: "boolean" }, issues: { type: "array", items: { type: "object", properties: { statement: { type: "string" }, problem: { type: "string" } } } } }, required: ["approved", "issues"] } } }],
  toolChoice: "required",
});
console.log(Date.now() - t, "ms", r.receipt.routedModel);
console.log("tool_calls:", JSON.stringify(r.message.tool_calls));
console.log("content:", r.message.content?.slice(0, 300));

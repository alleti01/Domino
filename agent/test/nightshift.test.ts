import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { NightshiftClient, NightshiftError, normalizeBaseUrl, parseConnectLink } from "../src/llm/nightshift.js";

process.env.DOMINO_MIN_CALL_INTERVAL_MS = "0";
import { isNemotron } from "../src/llm/receipts.js";

type Handler = (req: { url: string; headers: Record<string, string | string[] | undefined>; body: any }) => {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};

let server: Server | undefined;
afterEach(() => server?.close());

async function mockRuntime(handler: Handler): Promise<string> {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const out = handler({ url: req.url ?? "", headers: req.headers, body: raw ? JSON.parse(raw) : undefined });
      res.writeHead(out.status, { "Content-Type": "application/json", ...out.headers });
      res.end(out.body === undefined ? "" : JSON.stringify(out.body));
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

const completion = (routed: string) => ({
  id: "chatcmpl-1",
  model: "meterless/auto",
  choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
  meterless_receipt: { request_id: "req-1", routed_model: routed, provider_model: routed, reason: "race" },
});

describe("URL handling", () => {
  it("normalises any pasted runtime URL to <origin>/v1", () => {
    expect(normalizeBaseUrl("127.0.0.1:8088")).toBe("http://127.0.0.1:8088/v1");
    expect(normalizeBaseUrl("http://127.0.0.1:8088/v1")).toBe("http://127.0.0.1:8088/v1");
    expect(normalizeBaseUrl("http://127.0.0.1:8088/v1/chat/completions")).toBe("http://127.0.0.1:8088/v1");
    expect(normalizeBaseUrl("http://localhost:8088/healthz")).toBe("http://localhost:8088/v1");
  });

  it("parses connect links without leaking the key into the URL", () => {
    expect(parseConnectLink("http://10.0.0.5:8088/connect#k=abc")).toEqual({ baseUrl: "http://10.0.0.5:8088/v1", token: "abc" });
    expect(parseConnectLink("http://10.0.0.5:8088/other")).toBeNull();
  });
});

describe("status", () => {
  it("reports unauthorized (not offline) for a wrong token", async () => {
    const baseUrl = await mockRuntime(() => ({ status: 401, body: { error: "bad token" } }));
    const client = new NightshiftClient({ baseUrl, token: "wrong" });
    expect((await client.status()).status).toBe("unauthorized");
  });

  it("reports online when /v1/models lists meterless modes", async () => {
    const baseUrl = await mockRuntime(() => ({ status: 200, body: { data: [{ id: "meterless/auto" }, { id: "meterless/fast" }] } }));
    const client = new NightshiftClient({ baseUrl, token: "t" });
    expect(await client.status()).toEqual({ status: "online", models: ["meterless/auto", "meterless/fast"] });
  });

  it("reports offline when nothing is listening", async () => {
    const client = new NightshiftClient({ baseUrl: "http://127.0.0.1:9", token: "t" });
    expect((await client.status()).status).toBe("offline");
  });
});

describe("chat", () => {
  it("sends the contract headers, /no_think and a large max_tokens", async () => {
    let seen: any;
    const baseUrl = await mockRuntime((req) => {
      seen = req;
      return { status: 200, body: completion("nvidia/nemotron-3.5-lightning-30b-a3b") };
    });
    const client = new NightshiftClient({ baseUrl, token: "secret" });
    await client.chat({ messages: [{ role: "user", content: "hi" }], maxTokens: 100 });
    expect(seen.headers.authorization).toBe("Bearer secret");
    expect(seen.headers["meterless-app"]).toBe("domino");
    expect(seen.headers["meterless-scope"]).toBe("user");
    expect(seen.body.messages[0]).toEqual({ role: "system", content: "/no_think" });
    expect(seen.body.max_tokens).toBeGreaterThanOrEqual(2000);
  });

  it("retries 502s then succeeds, recording the attempt count", async () => {
    let calls = 0;
    const baseUrl = await mockRuntime(() => (++calls < 3 ? { status: 502, body: { error: "upstream" } } : { status: 200, body: completion("nvidia/nemotron-3.5-lightning-30b-a3b") }));
    const client = new NightshiftClient({ baseUrl, token: "t", backoffMs: [1, 1, 1] });
    const result = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(result.attempts).toBe(3);
    expect(result.receipt.routedModel).toBe("nvidia/nemotron-3.5-lightning-30b-a3b");
  });

  it("refuses answers routed to a non-Nemotron model when required", async () => {
    const baseUrl = await mockRuntime(() => ({ status: 200, body: completion("webllm/SmolLM2-1.7B") }));
    const client = new NightshiftClient({ baseUrl, token: "t", requireNemotron: true });
    await expect(client.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({ kind: "non_nemotron" });
  });

  it("does not retry an unauthorized token", async () => {
    let calls = 0;
    const baseUrl = await mockRuntime(() => {
      calls++;
      return { status: 401, body: {} };
    });
    const client = new NightshiftClient({ baseUrl, token: "t", backoffMs: [1, 1, 1] });
    await expect(client.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toBeInstanceOf(NightshiftError);
    expect(calls).toBe(1);
  });

  it("reads receipt fields from headers when the body has none", async () => {
    const baseUrl = await mockRuntime(() => ({
      status: 200,
      body: { id: "x", choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }] },
      headers: { "meterless-routed-model": "nvidia/nemotron-3-ultra-550b-a55b", "meterless-request-id": "r9" },
    }));
    const client = new NightshiftClient({ baseUrl, token: "t" });
    const { receipt } = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(receipt.routedModel).toBe("nvidia/nemotron-3-ultra-550b-a55b");
    expect(receipt.requestId).toBe("r9");
    expect(isNemotron(receipt)).toBe(true);
  });

  it("reads the real meterless.compute_receipt.v1 shape", async () => {
    const baseUrl = await mockRuntime(() => ({
      status: 200,
      body: {
        id: "chatcmpl-z",
        model: "nvidia/nemotron-3.5-lightning-30b-a3b",
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        meterless_receipt: {
          schema: "meterless.compute_receipt.v1",
          receipt_id: "rcpt_req_1",
          request_id: "req_1",
          winning_route: { model: "nvidia/nemotron-3.5-lightning-30b-a3b", provider: "nvidia", kind: "cloud" },
          phases: [{ phase: "final_synthesis", model: "nvidia/nemotron-3.5-lightning-30b-a3b", ms: 6283 }],
          cache: { status: "miss" },
          routing: { policy: "learned-router", reason: "single-candidate", winner: "nvidia/nemotron-3.5-lightning-30b-a3b" },
        },
      },
    }));
    const client = new NightshiftClient({ baseUrl, token: "t" });
    const { receipt } = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(receipt).toMatchObject({
      schema: "meterless.compute_receipt.v1",
      receiptId: "rcpt_req_1",
      requestId: "req_1",
      routedModel: "nvidia/nemotron-3.5-lightning-30b-a3b",
      reason: "single-candidate",
      phaseModels: ["nvidia/nemotron-3.5-lightning-30b-a3b"],
      cacheStatus: "miss",
    });
  });

  it("rejects a receipt where any phase ran on a non-Nemotron model", async () => {
    const baseUrl = await mockRuntime(() => ({
      status: 200,
      body: {
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        meterless_receipt: {
          winning_route: { model: "nvidia/nemotron-3.5-lightning-30b-a3b" },
          phases: [
            { phase: "draft", model: "webllm/Qwen2.5-3B-Instruct-q4f16_1-MLC" },
            { phase: "final_synthesis", model: "nvidia/nemotron-3.5-lightning-30b-a3b" },
          ],
        },
      },
    }));
    const client = new NightshiftClient({ baseUrl, token: "t" });
    await expect(client.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({ kind: "non_nemotron" });
  });

  it("never runs more than two calls at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const baseUrl = await mockRuntime(() => ({ status: 200, body: completion("nvidia/nemotron-3.5-lightning-30b-a3b") }));
    const slowFetch: typeof fetch = async (...args) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      try {
        return await fetch(...args);
      } finally {
        inFlight--;
      }
    };
    const client = new NightshiftClient({ baseUrl, token: "t", fetchImpl: slowFetch });
    await Promise.all(Array.from({ length: 6 }, () => client.chat({ messages: [{ role: "user", content: "hi" }] })));
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("backs off much longer after a rate limit (429) than after a 502", async () => {
    let calls = 0;
    const baseUrl = await mockRuntime(() =>
      ++calls < 2 ? { status: 502, body: { error: { message: '429: {"status":429,"title":"Too Many Requests"}' } } } : { status: 200, body: completion("nvidia/nemotron-3.5-lightning-30b-a3b") },
    );
    const waits: number[] = [];
    const client = new NightshiftClient({ baseUrl, token: "t", backoffMs: [1], rateLimitBackoffMs: [30] });
    const started = Date.now();
    const result = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    waits.push(Date.now() - started);
    expect(result.attempts).toBe(2);
    expect(waits[0]).toBeGreaterThanOrEqual(25); // used the rate-limit backoff, not the 1 ms one
  });
});

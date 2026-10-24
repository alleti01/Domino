// Meterless Nightshift client (Meterless Runtime 1.4, provider contract v4).
// Nightshift is Domino's primary AI provider; every call is OpenAI-compatible
// and every answer carries a receipt naming the model that actually handled it.

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { extractReceipt, isNemotron, type Receipt, type ReceiptLog } from "./receipts.js";

export const DEFAULT_BASE_URL = "http://127.0.0.1:8088/v1";
export const APP_ID = "domino";
const DETECT_PORTS = [8088, 8090, 8787, 11434];
const DETECT_HOSTS = ["127.0.0.1", "localhost", "[::1]"];
const APP_SUPPORT = join(homedir(), "Library", "Application Support");
// Where Nightshift editions write the runtime token (Mac M1–M4 edition uses the second).
const TOKEN_FILES = [
  join(APP_SUPPORT, "ai.meterless.runtime", "proxy-token"),
  join(APP_SUPPORT, "ai.meterless.nightshift.m1m4", "runtime-token"),
  join(APP_SUPPORT, "ai.meterless.nightshift", "runtime-token"),
];

export type RuntimeStatus = "online" | "unauthorized" | "offline";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  tools?: ToolSpec[];
  toolChoice?: "auto" | "none" | "required";
  maxTokens?: number;
  temperature?: number;
  /** Prepend the `/no_think` system message (default true). */
  noThink?: boolean;
  /** Free-form tag recorded with the receipt, e.g. "hypothesize" or "select_experiment". */
  purpose?: string;
}

export interface ChatResult {
  message: ChatMessage;
  finishReason: string | null;
  receipt: Receipt;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  attempts: number;
  latencyMs: number;
}

export class NightshiftError extends Error {
  constructor(
    message: string,
    readonly kind: "unauthorized" | "offline" | "upstream" | "timeout" | "bad_response" | "non_nemotron",
    readonly status?: number,
  ) {
    super(message);
    this.name = "NightshiftError";
  }
}

export interface NightshiftOptions {
  baseUrl?: string;
  token?: string;
  model?: string;
  requireNemotron?: boolean;
  timeoutMs?: number;
  maxConcurrency?: number;
  retries?: number;
  backoffMs?: number[];
  receiptLog?: ReceiptLog;
  fetchImpl?: typeof fetch;
}

/** Normalise any pasted runtime URL to `<origin>/v1` (never `/v1/v1`). */
export function normalizeBaseUrl(input: string): string {
  let raw = input.trim();
  if (!/^[a-z]+:\/\//i.test(raw)) raw = `http://${raw}`;
  const url = new URL(raw);
  return `${url.origin}/v1`;
}

/** Parse a Nightshift connect link (`http://host:port/connect#k=<key>`). */
export function parseConnectLink(link: string): { baseUrl: string; token: string } | null {
  try {
    const url = new URL(link);
    const key = new URLSearchParams(url.hash.replace(/^#/, "")).get("k");
    if (!url.pathname.startsWith("/connect") || !key) return null;
    return { baseUrl: `${url.origin}/v1`, token: key };
  } catch {
    return null;
  }
}

export async function readTokenFile(paths: string[] = TOKEN_FILES): Promise<string | undefined> {
  for (const path of paths) {
    try {
      const token = (await readFile(path, "utf8")).trim();
      if (token && token !== "rt-local") return token;
    } catch {
      // try the next location
    }
  }
  return undefined;
}

class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private readonly limit: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class NightshiftClient {
  readonly baseUrl: string;
  readonly model: string;
  private token: string | undefined;
  private readonly requireNemotron: boolean;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly backoffMs: number[];
  private readonly gate: Semaphore;
  private readonly receiptLog: ReceiptLog | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: NightshiftOptions = {}) {
    this.baseUrl = normalizeBaseUrl(opts.baseUrl ?? process.env.METERLESS_BASE_URL ?? DEFAULT_BASE_URL);
    this.token = opts.token ?? (process.env.METERLESS_RUNTIME_TOKEN || undefined);
    this.model = opts.model ?? process.env.METERLESS_MODEL ?? "meterless/auto";
    this.requireNemotron = opts.requireNemotron ?? process.env.REQUIRE_NEMOTRON !== "false";
    this.timeoutMs = opts.timeoutMs ?? 180_000;
    this.retries = opts.retries ?? 3;
    this.backoffMs = opts.backoffMs ?? [2_000, 4_000, 8_000];
    this.gate = new Semaphore(opts.maxConcurrency ?? 2);
    this.receiptLog = opts.receiptLog;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async authToken(): Promise<string> {
    this.token ??= await readTokenFile();
    if (!this.token || this.token === "rt-local") {
      throw new NightshiftError("No Meterless runtime token (set METERLESS_RUNTIME_TOKEN or start Nightshift)", "unauthorized");
    }
    return this.token;
  }

  private headers(token: string, chat: boolean): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "meterless-app": APP_ID,
    };
    if (chat) h["meterless-scope"] = "user";
    return h;
  }

  /** `/v1/models` decides status: 401/403 unauthorized, 200 with meterless ids online, else offline. */
  async status(): Promise<{ status: RuntimeStatus; models: string[] }> {
    let token: string;
    try {
      token = await this.authToken();
    } catch {
      token = "missing";
    }
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/models`, {
        headers: this.headers(token, false),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 401 || res.status === 403) return { status: "unauthorized", models: [] };
      if (!res.ok) return { status: "offline", models: [] };
      const body = (await res.json()) as { data?: Array<{ id?: string }> };
      const models = (body.data ?? []).map((m) => m.id ?? "").filter(Boolean);
      return { status: models.some((id) => id.startsWith("meterless/")) ? "online" : "offline", models };
    } catch {
      return { status: "offline", models: [] };
    }
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    return this.gate.run(() => this.chatOnce(req));
  }

  private async chatOnce(req: ChatRequest): Promise<ChatResult> {
    const token = await this.authToken();
    const messages = req.noThink === false ? req.messages : [{ role: "system" as const, content: "/no_think" }, ...req.messages];
    const body: Record<string, unknown> = {
      model: req.model ?? this.model,
      messages,
      max_tokens: Math.max(req.maxTokens ?? 2_000, 2_000),
    };
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.tools?.length) {
      body.tools = req.tools;
      body.tool_choice = req.toolChoice ?? "auto";
    }

    const started = Date.now();
    let lastError: NightshiftError | undefined;
    for (let attempt = 1; attempt <= this.retries + 1; attempt++) {
      try {
        const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: this.headers(token, true),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (res.status === 401 || res.status === 403) {
          throw new NightshiftError(`Nightshift rejected the runtime token (${res.status})`, "unauthorized", res.status);
        }
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const retryable = res.status === 429 || res.status >= 500;
          lastError = new NightshiftError(`Nightshift ${res.status}: ${text.slice(0, 300)}`, "upstream", res.status);
          if (!retryable) throw lastError;
        } else {
          const json = (await res.json()) as Record<string, any>;
          const choice = json.choices?.[0];
          const message = choice?.message as ChatMessage | undefined;
          const empty = !message || (!message.content && !message.tool_calls?.length);
          if (empty) {
            lastError = new NightshiftError("Nightshift returned an empty completion", "bad_response");
          } else {
            const receipt = extractReceipt(json, res.headers, {
              requestedModel: String(body.model),
              purpose: req.purpose,
              latencyMs: Date.now() - started,
              attempts: attempt,
            });
            await this.receiptLog?.append(receipt);
            if (this.requireNemotron && !isNemotron(receipt)) {
              throw new NightshiftError(
                `Receipt shows a non-Nemotron model (${receipt.routedModel ?? "unknown"}); seat only Nemotron lanes`,
                "non_nemotron",
              );
            }
            return {
              message,
              finishReason: choice.finish_reason ?? null,
              receipt,
              usage: json.usage,
              attempts: attempt,
              latencyMs: Date.now() - started,
            };
          }
        }
      } catch (err) {
        if (err instanceof NightshiftError && err.kind !== "upstream" && err.kind !== "bad_response") throw err;
        if (err instanceof NightshiftError) {
          lastError = err;
        } else if ((err as Error)?.name === "TimeoutError") {
          lastError = new NightshiftError(`Nightshift timed out after ${this.timeoutMs} ms`, "timeout");
        } else {
          lastError = new NightshiftError(`Nightshift unreachable: ${(err as Error)?.message}`, "offline");
        }
      }
      if (attempt <= this.retries) await sleep(this.backoffMs[attempt - 1] ?? this.backoffMs.at(-1) ?? 2_000);
    }
    throw lastError ?? new NightshiftError("Nightshift call failed", "offline");
  }
}

/** Try the documented ports/hosts and return the first runtime that answers online or unauthorized. */
export async function autoDetect(fetchImpl: typeof fetch = fetch): Promise<{ baseUrl: string; status: RuntimeStatus } | null> {
  for (const host of DETECT_HOSTS) {
    for (const port of DETECT_PORTS) {
      const client = new NightshiftClient({ baseUrl: `http://${host}:${port}`, fetchImpl });
      const { status } = await client.status();
      if (status !== "offline") return { baseUrl: client.baseUrl, status };
    }
  }
  return null;
}

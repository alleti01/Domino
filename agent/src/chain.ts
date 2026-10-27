// The cited cause chain: the explanation as ordered hops from the change to the outcome, each
// backed by rows or experiments this run actually returned. Code, not the model, checks it:
// every hop cited, the first hop anchored at the change, the last hop at the failed check (or,
// when nothing failed, at the metric that stayed within bounds). The prose is written from it.

import type { ExperimentResult } from "../../contracts/agent/types.js";

export interface ChainHop {
  claim: string;
  cites: string[];
}

export interface ChainContext {
  changeId: string;
  /** Rows on dependency-path links that start or end at the change. */
  changeRows: Set<string>;
  isKnownRef(ref: string): boolean;
  rowFact(ref: string): string | undefined;
  experiments: ExperimentResult[];
}

export interface ChainCheck {
  /** Hops that cite at least one returned ref, keeping only their valid cites. */
  hops: ChainHop[];
  /** Ref ids the valid hops cite. */
  refs: string[];
  problems: string[];
  /** What the last hop has to reach, for the repair request. */
  target: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Known ref ids inside one cite ("x-12ab: api.p99 60 → 100" → ["x-12ab"]). */
export function refsIn(cite: string, isKnownRef: (ref: string) => boolean): string[] {
  if (isKnownRef(cite.trim())) return [cite.trim()];
  const tokens = (cite.match(/[A-Za-z0-9_.:/-]+/g) ?? []).map((t) => t.replace(/[:.,-]+$/, ""));
  return [...new Set(tokens.filter((t) => t && isKnownRef(t)))];
}

/** Does `text` name this metric or check? Accepts the full name, its last part, or that part without a unit suffix. */
export function names(text: string, name: string): boolean {
  const hay = ` ${norm(text)} `;
  const local = name.includes(".") ? name.split(".").pop()! : name;
  const forms = [name, local, local.replace(/_(ms|s|sec|bytes|pct|count)$/, "")].map(norm).filter((f) => f.length >= 3);
  return forms.some((f) => hay.includes(` ${f} `));
}

export function checkChain(raw: unknown, ctx: ChainContext): ChainCheck {
  const input: ChainHop[] = (Array.isArray(raw) ? raw : [])
    .filter((h): h is Record<string, unknown> => !!h && typeof h === "object")
    .map((h) => ({
      claim: typeof h.claim === "string" ? h.claim.trim() : "",
      cites: (Array.isArray(h.cites) ? h.cites : typeof h.cites === "string" ? h.cites.split(/,\s*/) : []).map(String).map((c) => c.trim()).filter(Boolean),
    }));
  const problems: string[] = [];
  const hops: ChainHop[] = [];
  input.forEach((h, i) => {
    if (!h.claim) {
      problems.push(`hop ${i + 1} has no claim`);
      return;
    }
    const valid = h.cites.filter((c) => refsIn(c, ctx.isKnownRef).length);
    const invalid = h.cites.filter((c) => !valid.includes(c));
    if (invalid.length) problems.push(`hop ${i + 1} cites ${invalid.map((c) => `"${c}"`).join(", ")}, which this run never returned`);
    if (!valid.length) problems.push(`hop ${i + 1} ("${h.claim.slice(0, 60)}") cites no row_id or experiment_id from this run`);
    else hops.push({ claim: h.claim, cites: valid });
  });
  if (input.length < 2) problems.push("write at least two hops: from the change to the outcome");

  const tail = ctx.changeId.split("/").pop() ?? ctx.changeId;
  const changeKeys = [ctx.changeId, ...(tail.length >= 3 ? [tail] : [])].map((k) => k.toLowerCase());
  const first = hops[0];
  if (first) {
    const refs = first.cites.flatMap((c) => refsIn(c, ctx.isKnownRef));
    const text = [first.claim, ...first.cites, ...refs.map((r) => ctx.rowFact(r) ?? "")].join(" ").toLowerCase();
    if (!refs.some((r) => ctx.changeRows.has(r)) && !changeKeys.some((k) => text.includes(k))) {
      problems.push(`hop 1 must start at the change ${ctx.changeId}: name it, or cite the row that links it to what it touches${ctx.changeRows.size ? ` (${[...ctx.changeRows].slice(0, 3).join(", ")})` : ""}`);
    }
  }

  const candidates = ctx.experiments.filter((x) => x.completed && x.request.variant === "candidate");
  const failing = candidates.filter((x) => x.assertions.some((a) => !a.passed));
  const last = hops.at(-1);
  const lastRefs = new Set(last ? last.cites.flatMap((c) => refsIn(c, ctx.isKnownRef)) : []);
  const lastText = last ? `${last.claim} ${last.cites.join(" ")}` : "";
  let target = "the outcome";
  if (failing.length) {
    const checks = [...new Set(failing.flatMap((x) => x.assertions.filter((a) => !a.passed).map((a) => a.name)))];
    target = `the failed check (${checks.join(", ")}) in ${failing.map((x) => x.experiment_id).slice(0, 3).join(", ")}`;
    // The chain ends at the failing run, and the hops that cite it name the failed check (often the last two hops
    // split the effect and the check).
    const cited = failing.filter((x) => lastRefs.has(x.experiment_id));
    const failingText = hops.filter((h) => h.cites.some((c) => refsIn(c, ctx.isKnownRef).some((r) => failing.some((x) => x.experiment_id === r)))).map((h) => `${h.claim} ${h.cites.join(" ")}`).join(" ");
    const named = failing.some((x) => x.assertions.some((a) => !a.passed && names(failingText, a.name)));
    if (!cited.length || !named) problems.push(`the chain must end at ${target}: cite that experiment in the last hop and name the check`);
  } else if (candidates.length) {
    const metrics = [...new Set(candidates.flatMap((x) => Object.keys(x.observations)))];
    target = `the metric that stayed within bounds, baseline vs candidate (one of ${metrics.slice(0, 8).join(", ")}) in ${candidates.map((x) => x.experiment_id).slice(0, 3).join(", ")}`;
    const cited = candidates.filter((x) => lastRefs.has(x.experiment_id));
    const named = cited.some((x) => Object.keys(x.observations).some((k) => names(lastText, k)));
    if (!cited.length || !named) problems.push(`nothing failed, so the last hop must say where the chain stops: ${target}, with its values`);
  }
  return { hops, refs: [...new Set(hops.flatMap((h) => h.cites.flatMap((c) => refsIn(c, ctx.isKnownRef))))], problems, target };
}

/** The prose explanation, written from the chain. */
export function renderChain(hops: ChainHop[]): string {
  return hops.map((h) => `${h.claim.replace(/[\s.;]+$/, "")} [${h.cites.join("; ")}]`).join(" → ") + ".";
}

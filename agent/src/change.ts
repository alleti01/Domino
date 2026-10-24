// Change reader: turns a PR diff into a deterministic summary of what changed and which
// entities it touches. The model sees this plus the raw diff; nothing here guesses impact.

import type { ChangeRequest } from "../../contracts/agent/types.js";

export interface ParsedChange {
  summary: string;
  files: string[];
  added: string[];
  removed: string[];
  entities: Array<{ id: string; kind: string; source_line?: string }>;
}

const PATTERNS: Array<{ kind: string; re: RegExp; group: number }> = [
  { kind: "principal", re: /\bTO\s+([A-Za-z_][\w.-]*)/gi, group: 1 },
  { kind: "principal", re: /\bFROM\s+ROLE\s+([A-Za-z_][\w.-]*)/gi, group: 1 },
  { kind: "object", re: /\bON\s+([A-Za-z_][\w.*-]*)/gi, group: 1 },
  { kind: "table", re: /\b(?:ALTER|CREATE|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([A-Za-z_][\w.-]*)/gi, group: 1 },
  { kind: "column", re: /\b(?:ADD|DROP|ALTER|RENAME)\s+COLUMN\s+([A-Za-z_][\w-]*)/gi, group: 1 },
  { kind: "setting", re: /^\s*"?([A-Za-z_][\w.-]*)"?\s*[:=]/g, group: 1 },
  { kind: "field", re: /\bfield[s]?\s*[:=]?\s*\[?\s*"?([A-Za-z_][\w-]*)/gi, group: 1 },
  { kind: "dependency", re: /"([@\w/.-]+)"\s*:\s*"[~^]?\d[\w.-]*"/g, group: 1 },
];

export function parseChange(change: ChangeRequest): ParsedChange {
  const lines = change.diff.split("\n");
  const added = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1).trim());
  const removed = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).map((l) => l.slice(1).trim());

  const entities = new Map<string, { id: string; kind: string; source_line?: string }>();
  for (const line of [...added, ...removed]) {
    for (const { kind, re, group } of PATTERNS) {
      for (const m of line.matchAll(re)) {
        const id = m[group]?.replace(/[;,]$/, "");
        if (id && !entities.has(id)) entities.set(id, { id, kind, source_line: line });
      }
    }
  }

  const files = change.files.length ? change.files : lines.filter((l) => l.startsWith("+++ ")).map((l) => l.replace(/^\+\+\+ (b\/)?/, ""));
  const summary =
    `${change.title}. ${files.length} file(s): ${files.join(", ")}. ` +
    `${added.length} line(s) added, ${removed.length} removed. ` +
    (entities.size ? `Touches: ${[...entities.values()].map((e) => `${e.kind} ${e.id}`).join(", ")}.` : "No entities recognised.");

  return { summary, files, added, removed, entities: [...entities.values()] };
}

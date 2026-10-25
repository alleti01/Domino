// Print a readable view of the latest (or given) run's trace.
import { readdirSync, readFileSync } from "node:fs";
import { renderTrace } from "../src/render.js";
const dir = process.argv[2] ?? `runs/${readdirSync("runs").filter((d) => d.startsWith("run-")).sort().at(-1)}`;
console.log(renderTrace(readFileSync(`${dir}/trace.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l))));

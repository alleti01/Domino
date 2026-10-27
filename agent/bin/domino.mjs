#!/usr/bin/env node
// The domino command. Runs the TypeScript sources directly through tsx, so there is no build step.
import { register } from "tsx/esm/api";

// The World Model engine uses node:sqlite; its "experimental" notice would print on every command.
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => (String(warning).includes("SQLite is an experimental feature") ? undefined : emitWarning.call(process, warning, ...rest));

register();
await import("../src/cli.ts");

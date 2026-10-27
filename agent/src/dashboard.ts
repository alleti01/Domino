// `domino dashboard`: start the dashboard pointed at this machine's runs folder, so runs appear in
// the console while they run. Uses the UI's own dev server, which serves the runs folder over its file API.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { UI_DIR } from "./config.js";

export async function dashboard(opts: { runsDir: string; port: number; open: boolean }): Promise<number> {
  if (!existsSync(join(UI_DIR, "package.json"))) throw new Error(`No dashboard at ${UI_DIR}`);
  if (!existsSync(join(UI_DIR, "node_modules"))) throw new Error(`The dashboard's packages are not installed: run \`npm ci\` in ${UI_DIR}`);
  mkdirSync(opts.runsDir, { recursive: true });
  const url = `http://localhost:${opts.port}/#/runs`;
  console.log(`Dashboard: ${url}\nRuns folder: ${opts.runsDir}\nStop with Ctrl+C.`);
  const child = spawn("npm", ["run", "dev", "--", "--port", String(opts.port), "--strictPort"], {
    cwd: UI_DIR,
    stdio: "inherit",
    env: { ...process.env, DOMINO_RUNS_DIR: opts.runsDir },
  });
  if (opts.open) setTimeout(() => spawn("open", [url], { stdio: "ignore" }).on("error", () => {}), 2500);
  return new Promise((resolve) => child.on("exit", (code) => resolve(code ?? 0)));
}

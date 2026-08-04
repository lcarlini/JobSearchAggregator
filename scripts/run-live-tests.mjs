#!/usr/bin/env node
/** Set JSA_LIVE_HEALTH=1 and run the full test suite (including live health). */
import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = globSync("tests/**/*.test.mjs", { cwd: root }).map((f) => path.join(root, f));
if (!files.length) {
  console.error("No test files found");
  process.exit(1);
}
const env = { ...process.env, JSA_LIVE_HEALTH: "1" };
const r = spawnSync(process.execPath, ["--test", ...files], {
  cwd: root,
  env,
  stdio: "inherit",
});
process.exit(r.status ?? 1);

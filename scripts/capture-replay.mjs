// Bundles `capture-replay.ts` for Node with rolldown (Vite's bundler, already a
// dependency) and runs it. The project's sources import each other without
// extensions, which Node will not resolve on its own.

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

// The bundle is written inside the project so Node resolves `@napi-rs/canvas`
// from the project's own node_modules; the directory is ignored by git.
const root = resolve(import.meta.dirname, "..");
const out = join(root, "node_modules", ".cache", "carom-replay");
mkdirSync(out, { recursive: true });
try {
  const bundle = spawnSync(
    "npx",
    [
      "rolldown",
      "scripts/capture-replay.ts",
      "--file",
      join(out, "capture-replay.mjs"),
      "--format",
      "esm",
      "--platform",
      "node",
      "--external",
      "@napi-rs/canvas",
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (bundle.status !== 0) process.exit(bundle.status ?? 1);
  const run = spawnSync(process.execPath, [join(out, "capture-replay.mjs")], {
    cwd: root,
    stdio: "inherit",
  });
  process.exit(run.status ?? 1);
} finally {
  rmSync(out, { recursive: true, force: true });
}

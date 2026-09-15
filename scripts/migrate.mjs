import { spawnSync } from "node:child_process";
const result = spawnSync(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    "wrangler.local.json",
    "--persist-to",
    ".wrangler/state",
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);

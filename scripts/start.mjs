import "./sites-env.mjs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const localPath = (name) =>
  fileURLToPath(new URL("../" + name, import.meta.url));
const child = spawn(
  process.execPath,
  [
    localPath("node_modules/wrangler/bin/wrangler.js"),
    "dev",
    "--config",
    localPath("dist/server/wrangler.json"),
    "--local",
    "--persist-to",
    localPath(".wrangler/state"),
    "--ip",
    "127.0.0.1",
    "--inspector-port",
    "0",
    "--env-file",
    localPath(".env"),
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));

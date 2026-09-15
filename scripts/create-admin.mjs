import { randomBytes, pbkdf2Sync, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
const login = process.env.ADMIN_LOGIN,
  password = process.env.ADMIN_PASSWORD;
if (!login || !password || password.length < 12)
  throw new Error(
    "Set ADMIN_LOGIN and ADMIN_PASSWORD (at least 12 characters) in environment.",
  );
const salt = randomBytes(24).toString("hex"),
  hash = pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
const sql = `INSERT INTO admins(id,login,password_hash,salt,created_at) VALUES (${[randomUUID(), login, hash, salt].map(quote).join(",")},${Math.floor(Date.now() / 1000)}) ON CONFLICT(login) DO UPDATE SET password_hash=excluded.password_hash,salt=excluded.salt; DELETE FROM sessions WHERE admin_id=(SELECT id FROM admins WHERE login=${quote(login)});`;
fs.mkdirSync(".local", { recursive: true });
fs.writeFileSync(".local/admin.sql", sql);
const result = spawnSync(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    "d1",
    "execute",
    "DB",
    "--local",
    "--config",
    "dist/server/wrangler.json",
    "--persist-to",
    ".wrangler/state",
    "--file",
    ".local/admin.sql",
  ],
  { stdio: "inherit" },
);
fs.unlinkSync(".local/admin.sql");
process.exit(result.status ?? 1);

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const base = "http://localhost:5173";
async function post(path, body) {
  const response = await fetch(base + "/api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
const phone = () =>
  "+7" + String(7200000000 + Math.floor(Math.random() * 799999999));
const challenge = await post("auth/send", { phone: phone() });
assert.equal(challenge.status, 200);
for (let i = 0; i < 5; i++)
  assert.equal(
    (
      await post("auth/verify", {
        challengeId: challenge.data.challengeId,
        code: "0000",
      })
    ).status,
    400,
  );
const blocked = await post("auth/verify", {
  challengeId: challenge.data.challengeId,
  code: challenge.data.developmentCode,
});
assert.equal(blocked.status, 400);
assert.match(blocked.data.error, /попытки закончились/);
console.log("PASS Five wrong attempts block even the correct OTP");
const expired = await post("auth/send", { phone: phone() });
assert.equal(expired.status, 200);
assert.match(expired.data.challengeId, /^[a-f0-9-]+$/);
// Advance only this local test challenge to the expired state; never change production time or limits.
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
    "wrangler.local.json",
    "--persist-to",
    ".wrangler/state",
    "--command",
    `UPDATE challenges SET expires=0 WHERE id='${expired.data.challengeId}'`,
  ],
  { encoding: "utf8" },
);
assert.equal(result.status, 0, result.stderr);
const invalid = await post("auth/verify", {
  challengeId: expired.data.challengeId,
  code: expired.data.developmentCode,
});
assert.equal(invalid.status, 400);
assert.match(invalid.data.error, /Код истёк/);
console.log("PASS Expired OTP cannot authenticate");
const malformed = await fetch(base + "/api/auth/send", {
  method: "POST",
  headers: { Origin: base, "Content-Type": "application/json" },
  body: "{oops",
});
assert.equal(malformed.status, 400);
console.log("PASS Malformed JSON produces a safe client error");
const oversized = await fetch(base + "/api/auth/send", {
  method: "POST",
  headers: { Origin: base, "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "7".repeat(110000) }),
});
assert.equal(oversized.status, 413);
console.log("PASS Oversized request rejected before authentication");
console.log("\n4 authentication boundary checks passed.");

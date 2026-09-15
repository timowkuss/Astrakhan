import assert from "node:assert/strict";
import fs from "node:fs";
const base = process.env.TEST_URL || "http://localhost:5173";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Run only against a local test database",
);
const creds =
  process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD
    ? { login: process.env.ADMIN_LOGIN, password: process.env.ADMIN_PASSWORD }
    : JSON.parse(
        fs
          .readFileSync(".local/admin-credentials.json", "utf8")
          .replace(/^\uFEFF/, ""),
      );
class Client {
  cookie = "";
  async call(path, method = "GET", body) {
    const response = await fetch(base + "/api/" + path, {
      method,
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        Cookie: this.cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (response.headers.has("set-cookie"))
      this.cookie = response.headers.get("set-cookie").split(";")[0];
    return { status: response.status, data };
  }
  async ok(...args) {
    const r = await this.call(...args);
    assert.equal(r.status, 200, JSON.stringify(r));
    return r.data;
  }
}
const admin = new Client();
await admin.ok("admin/login", "POST", creds);
const catalog = await admin.ok("catalog");
const a = new Client(),
  b = new Client();
for (const c of [a, b]) {
  const phone =
    "+7" + String(7100000000 + Math.floor(Math.random() * 899999999));
  const otp = await c.ok("auth/send", "POST", { phone });
  await c.ok("auth/verify", "POST", {
    challengeId: otp.challengeId,
    code: otp.developmentCode,
  });
  await c.ok("profile", "PUT", { name: "Проверка конкурентных заказов" });
}
const mergeKey = crypto.randomUUID();
await Promise.all([
  a.ok("cart", "POST", { mergeKey, items: { "milk-25": 2 } }),
  a.ok("cart", "POST", { mergeKey, items: { "milk-25": 2 } }),
]);
assert.equal((await a.ok("cart")).cart["milk-25"], 2);
console.log("PASS Concurrent guest merge executes once");
const results = await Promise.all([
  a.call("checkout", "POST", {
    method: "card",
    idempotencyKey: crypto.randomUUID(),
  }),
  a.call("checkout", "POST", {
    method: "kaspi",
    idempotencyKey: crypto.randomUUID(),
  }),
]);
const good = results.filter((r) => r.status === 200);
assert(good.length >= 1);
assert.equal((await a.ok("orders")).orders.length, 1);
if (good.length === 2) assert.equal(good[0].data.id, good[1].data.id);
console.log("PASS Different keys cannot checkout the same cart revision twice");
assert.equal((await b.call("orders/" + good[0].data.id)).status, 404);
console.log("PASS Another customer cannot read the order");
const soap = catalog.products.find((p) => p.id === "fairy");
await admin.ok("admin/products", "PUT", { ...soap, stock: 1 });
await a.ok("cart", "PUT", { items: { fairy: 1 } });
await b.ok("cart", "PUT", { items: { fairy: 1 } });
const stockRace = await Promise.all([
  a.call("checkout", "POST", {
    method: "card",
    idempotencyKey: crypto.randomUUID(),
  }),
  b.call("checkout", "POST", {
    method: "card",
    idempotencyKey: crypto.randomUUID(),
  }),
]);
assert.equal(stockRace.filter((r) => r.status === 200).length, 1);
assert.equal(stockRace.filter((r) => r.status === 409).length, 1);
assert.equal(
  (await admin.ok("catalog")).products.find((p) => p.id === "fairy").stock,
  0,
);
console.log("PASS Last item cannot be sold twice");
const winner = stockRace.find((r) => r.status === 200).data;
const cancellations = await Promise.all([
  admin.call("admin/orders/" + winner.id, "PATCH", {
    status: "cancelled",
    reason: "Тест возврата остатка",
  }),
  admin.call("admin/orders/" + winner.id, "PATCH", {
    status: "cancelled",
    reason: "Тест повторной отмены",
  }),
]);
assert.equal(cancellations.filter((r) => r.status === 200).length, 1);
assert.equal(
  (await admin.ok("catalog")).products.find((p) => p.id === "fairy").stock,
  1,
);
console.log("PASS Concurrent cancellation restores stock once");
const picture = fs.readFileSync("public/products/soap.webp");
const form = new FormData();
form.set("file", new Blob([picture], { type: "image/webp" }), "soap.webp");
const uploaded = await fetch(base + "/api/admin/products/fairy/image", {
  method: "POST",
  headers: { Origin: base, Cookie: admin.cookie },
  body: form,
});
assert.equal(uploaded.status, 200);
const updated = (await admin.ok("catalog")).products.find(
  (p) => p.id === "fairy",
);
const photo = await fetch(base + updated.image);
assert.equal(photo.status, 200);
assert.equal(photo.headers.get("content-type"), "image/webp");
console.log("PASS Admin photo upload and persistent image retrieval");
const bad = new FormData();
bad.set(
  "file",
  new Blob(["<script>alert(1)</script>"], { type: "image/webp" }),
  "fake.webp",
);
const badUpload = await fetch(base + "/api/admin/products/fairy/image", {
  method: "POST",
  headers: { Origin: base, Cookie: admin.cookie },
  body: bad,
});
assert.equal(badUpload.status, 400);
console.log("PASS Forged image content rejected");
await admin.ok("admin/products", "PUT", { ...soap, stock: 0 });
await a.ok("auth/logout", "POST", {});
await b.ok("auth/logout", "POST", {});
console.log("\n7 concurrency and upload checks passed.");

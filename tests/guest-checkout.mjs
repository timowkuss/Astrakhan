import assert from "node:assert/strict";
import fs from "node:fs";
const base = process.env.TEST_URL || "http://localhost:5173";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
class Client {
  cookie = "";
  async call(path, method = "GET", body, status = 200) {
    const r = await fetch(base + "/api/" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: base,
        Cookie: this.cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    assert.equal(r.status, status, JSON.stringify(data));
    if (r.headers.get("set-cookie"))
      this.cookie = r.headers.get("set-cookie").split(";")[0];
    return data;
  }
}
const a = new Client(),
  b = new Client(),
  admin = new Client();
const input = { name: "Проверка гостевого заказа", phone: "+77000000999" };
await a.call("auth/guest", "POST", { ...input, phone: "123" }, 400);
await a.call("auth/guest", "POST", input);
const me = (await a.call("me")).user;
assert.equal(me.guest, true);
assert.equal(me.phone, input.phone);
console.log("PASS guest session without OTP and phone validation");
await b.call("auth/guest", "POST", input);
assert.notEqual((await b.call("me")).user.id, me.id);
const catalog = await a.call("catalog");
const product = catalog.products.find((p) => p.stock > 1);
const mergeKey = crypto.randomUUID();
await a.call("cart", "POST", { items: { [product.id]: 1 }, mergeKey });
await a.call("cart", "POST", { items: { [product.id]: 1 }, mergeKey });
const key = crypto.randomUUID();
await a.call(
  "checkout",
  "POST",
  { method: "card", idempotencyKey: key, testResult: "failure" },
  402,
);
assert.equal((await a.call("cart")).cart[product.id], 1);
const order = await a.call("checkout", "POST", {
  method: "card",
  idempotencyKey: key,
  testResult: "success",
  total: 1,
});
assert.equal(order.phone, input.phone);
assert.equal(order.name, input.name);
assert.equal(
  order.total,
  Math.round((product.price * 100) / (product.unit === "kg" ? 2 : 1)) / 100,
);
assert.equal(
  (
    await a.call("checkout", "POST", {
      method: "card",
      idempotencyKey: key,
      testResult: "success",
    })
  ).id,
  order.id,
);
assert.deepEqual((await a.call("cart")).cart, {});
console.log("PASS guest payment decline, retry, server total and idempotency");
await b.call("orders/" + order.id, "GET", undefined, 404);
assert.equal((await b.call("orders")).orders.length, 0);
await a.call("admin/orders", "GET", undefined, 403);
assert.equal((await a.call("orders/" + order.id)).id, order.id);
console.log("PASS same-phone guests isolated; guest cannot access admin");
const creds = JSON.parse(
  fs
    .readFileSync(".local/admin-credentials.json", "utf8")
    .replace(/^\uFEFF/, ""),
);
await admin.call("admin/login", "POST", creds);
const adminOrder = await admin.call("admin/orders/" + order.id);
assert.equal(adminOrder.phone, input.phone);
await admin.call("admin/orders/" + order.id, "PATCH", {
  status: "cancelled",
  reason: "Завершена проверка гостевого оформления",
});
await a.call("auth/logout", "POST", {});
await a.call("orders/" + order.id, "GET", undefined, 401);
console.log("PASS admin sees guest order; logout removes guest access");

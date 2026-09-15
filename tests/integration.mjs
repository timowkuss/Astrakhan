import assert from "node:assert/strict";
import fs from "node:fs";
const base = process.env.TEST_URL || "http://localhost:5173";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Run only against a local test database",
);
const credentials =
  process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD
    ? { login: process.env.ADMIN_LOGIN, password: process.env.ADMIN_PASSWORD }
    : JSON.parse(
        fs
          .readFileSync(".local/admin-credentials.json", "utf8")
          .replace(/^\uFEFF/, ""),
      );
class Client {
  cookie = "";
  async request(path, method = "GET", body, expected = 200) {
    const response = await fetch(base + "/api/" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: base,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    assert.equal(response.status, expected, JSON.stringify(data));
    if (response.headers.get("set-cookie"))
      this.cookie = response.headers.get("set-cookie").split(";")[0];
    return data;
  }
}
let checks = 0;
const check = (msg) => {
  checks++;
  console.log("PASS", msg);
};
const customer = new Client(),
  guest = new Client(),
  admin = new Client();
const phone = "+7" + String(7000000000 + Math.floor(Math.random() * 999999999));
const catalog = await guest.request("catalog");
assert(catalog.products.length >= 12);
assert(catalog.categories.some((c) => c.parent_id));
check("Seed catalog and two category levels");
for (const q of [
  "молоко простоквашино",
  "простоквашино 2.5",
  "молоко 2,5 простоквашино",
]) {
  const d = await guest.request("catalog?q=" + encodeURIComponent(q));
  assert(d.products.some((p) => p.id === "milk-25"));
}
check("Token search, word order and decimal separator");
await guest.request("admin/orders", "GET", undefined, 403);
await guest.request("cart", "GET", undefined, 401);
check("Anonymous API access protected");
const challenge = await customer.request("auth/send", "POST", { phone });
assert.match(challenge.developmentCode, /^\d{4}$/);
await customer.request("auth/send", "POST", { phone }, 429);
await customer.request(
  "auth/verify",
  "POST",
  { challengeId: challenge.challengeId, code: "0000" },
  400,
);
await customer.request("auth/verify", "POST", {
  challengeId: challenge.challengeId,
  code: challenge.developmentCode,
});
await guest.request(
  "auth/verify",
  "POST",
  { challengeId: challenge.challengeId, code: challenge.developmentCode },
  400,
);
check("OTP cooldown, wrong code, single use and session");
await customer.request("cart", "POST", {
  items: { "milk-25": 2, cheese: 3 },
  mergeKey: crypto.randomUUID(),
});
let cart = await customer.request("cart");
assert.equal(cart.cart["cheese"], 3);
assert.equal(cart.cart["milk-25"], 2);
await customer.request("cart", "PUT", { items: { cheese: 0.3 } }, 400);
await customer.request("cart", "PUT", { items: { fairy: 1 } }, 409);
check("Guest merge, half-kg ticks and stock validation");
const anotherSession = new Client();
anotherSession.cookie = customer.cookie;
assert.equal((await anotherSession.request("cart")).cart.cheese, 3);
check("Cart persists on server");
await customer.request("profile", "PUT", {
  name: "Тестовый Покупатель ASTRAKHAN",
  contact: "",
});
const key = crypto.randomUUID();
await customer.request(
  "checkout",
  "POST",
  { method: "card", idempotencyKey: key, testResult: "failure" },
  402,
);
assert.equal((await customer.request("cart")).cart.cheese, 3);
check("Declined payment preserves cart");
const input = {
  method: "kaspi",
  idempotencyKey: key,
  testResult: "success",
  total: 1,
};
const [order, repeated] = await Promise.all([
  customer.request("checkout", "POST", input),
  customer.request("checkout", "POST", input),
]);
assert.equal(order.id, repeated.id);
assert.equal(order.status, "paid");
assert.equal(order.total, 6100);
assert.equal((await customer.request("orders")).orders.length, 1);
assert.equal(Object.keys((await customer.request("cart")).cart).length, 0);
check(
  "Concurrent checkout idempotency, server totals, paid order and cleared cart",
);
await guest.request("orders/" + order.id, "GET", undefined, 401);
await customer.request(
  "admin/orders/" + order.id,
  "PATCH",
  { status: "cancelled", reason: "test" },
  403,
);
check("Order ownership and admin-only status");
await admin.request("admin/login", "POST", credentials);
let product = catalog.products.find((p) => p.id === "milk-25");
await admin.request("admin/products", "PUT", {
  ...product,
  price: 999,
  stock: 30,
});
assert.equal(
  (await customer.request("orders/" + order.id)).items.find(
    (i) => i.product_id === "milk-25",
  ).price,
  650,
);
check("Order item price snapshot survives product update");
await admin.request(
  "admin/orders/" + order.id,
  "PATCH",
  { status: "ready" },
  409,
);
await admin.request("admin/orders/" + order.id, "PATCH", {
  status: "assembling",
});
assert.equal(
  (await customer.request("orders/" + order.id)).status,
  "assembling",
);
check("Status transition validation and customer status refresh");
await admin.request("admin/orders/" + order.id + "/adjust", "POST", {
  reason: "Тест: клиент согласовал уменьшение количества",
  items: [
    { productId: "milk-25", quantity: 1 },
    { productId: "cheese", quantity: 2 },
  ],
});
const adjusted = await customer.request("orders/" + order.id);
assert.equal(adjusted.total, 3850);
assert.equal(adjusted.paid_total, 6100);
check("Manual adjustment keeps original prices and paid amount");
await admin.request("admin/orders/" + order.id, "PATCH", { status: "ready" });
await admin.request("admin/orders/" + order.id, "PATCH", {
  status: "received",
});
assert.equal((await customer.request("orders/" + order.id)).status, "received");
await admin.request(
  "admin/orders/" + order.id,
  "PATCH",
  { status: "cancelled", reason: "Нельзя отменить полученный" },
  409,
);
check("Paid → assembling → ready → received");
await customer.request("cart", "PUT", { items: { "milk-25": 1 } });
const cancelled = await customer.request("checkout", "POST", {
  method: "card",
  idempotencyKey: crypto.randomUUID(),
});
await admin.request(
  "admin/orders/" + cancelled.id,
  "PATCH",
  { status: "cancelled", reason: "" },
  400,
);
await admin.request("admin/orders/" + cancelled.id, "PATCH", {
  status: "cancelled",
  reason: "Клиент попросил отменить",
});
assert.equal(
  (await customer.request("orders/" + cancelled.id)).status,
  "cancelled",
);
check("Cancellation requires reason");
const categoryId = crypto.randomUUID();
await admin.request("admin/categories", "POST", {
  id: categoryId,
  name: "Тестовая категория",
  parent_id: null,
  position: 99,
});
await admin.request("admin/categories", "PUT", {
  id: categoryId,
  name: "Обновлённая категория",
  parent_id: "dairy",
  position: 8,
});
await admin.request("admin/categories/" + categoryId, "DELETE", {});
await admin.request("admin/categories/dairy", "DELETE", {}, 400);
check("Category create, edit, ordering, delete and dependency protection");
const audit = await admin.request("admin/audit");
assert(audit.events.length >= 8);
check("Critical admin actions audited");
await admin.request("admin/products", "PUT", {
  ...product,
  price: 650,
  stock: 35,
});
const cross = await fetch(base + "/api/profile", {
  method: "PUT",
  headers: {
    "Content-Type": "application/json",
    Origin: "https://malicious.example",
    Cookie: customer.cookie,
  },
  body: JSON.stringify({ name: "forged" }),
});
assert.equal(cross.status, 403);
check("Cross-origin mutation rejected");
await customer.request("auth/logout", "POST", {});
await customer.request("cart", "GET", undefined, 401);
check("Logout invalidates server session");
console.log(`\n${checks} integration checks passed.`);

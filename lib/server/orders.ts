import { database, first, rows, stmt, uid, now, assert, ApiError } from "./db";
import { paymentProvider } from "./providers";
import { canTransition } from "../domain";
export async function cartFor(userId: string) {
  await stmt(
    "INSERT OR IGNORE INTO carts(id,user_id,store_id) VALUES (?,?,'main')",
    userId,
    userId,
  ).run();
  return Object.fromEntries(
    (
      await rows(
        "SELECT product_id,quantity FROM cart_items WHERE cart_id=?",
        userId,
      )
    ).map((i) => [i.product_id, i.quantity]),
  );
}
export async function setCart(
  userId: string,
  items: Record<string, number>,
  merge = false,
  mergeKey?: string,
) {
  assert(
    items && typeof items === "object" && !Array.isArray(items),
    "Неверная корзина",
  );
  assert(Object.keys(items).length <= 100, "В корзине слишком много позиций");
  await cartFor(userId);
  const mergeId = userId + ":" + mergeKey;
  if (merge) {
    assert(
      typeof mergeKey === "string" && /^[a-zA-Z0-9_-]{16,100}$/.test(mergeKey),
      "Неверный ключ переноса корзины",
    );
    if (await first("SELECT id FROM cart_merges WHERE id=?", mergeId))
      return cartFor(userId);
  }
  const statements = [];
  if (merge)
    statements.push(
      stmt(
        "INSERT INTO cart_merges(id,user_id,created_at) VALUES (?,?,?)",
        mergeId,
        userId,
        now(),
      ),
    );
  for (const [id, q] of Object.entries(items)) {
    assert(
      Number.isInteger(q) && q >= 0 && q <= 999,
      "Количество должно меняться фиксированным шагом",
    );
    const p = await first(
      "SELECT stock FROM products WHERE id=? AND active=1",
      id,
    );
    assert(p, "Товар не найден");
    if (!merge)
      assert(q <= p.stock, "Доступное количество товара изменилось", 409);
    if (q === 0)
      statements.push(
        stmt(
          "DELETE FROM cart_items WHERE cart_id=? AND product_id=?",
          userId,
          id,
        ),
      );
    else
      statements.push(
        merge
          ? stmt(
              "INSERT INTO cart_items(id,cart_id,product_id,quantity) VALUES (?,?,?,MIN(?,?)) ON CONFLICT(cart_id,product_id) DO UPDATE SET quantity=MIN(cart_items.quantity+excluded.quantity,?)",
              uid(),
              userId,
              id,
              q,
              p.stock,
              p.stock,
            )
          : stmt(
              "INSERT INTO cart_items(id,cart_id,product_id,quantity) VALUES (?,?,?,?) ON CONFLICT(cart_id,product_id) DO UPDATE SET quantity=excluded.quantity",
              uid(),
              userId,
              id,
              q,
            ),
      );
  }
  if (statements.length) {
    statements.push(
      stmt("UPDATE carts SET revision=revision+1 WHERE id=?", userId),
    );
    try {
      await database().batch(statements);
    } catch (error) {
      if (
        !merge ||
        !(await first("SELECT id FROM cart_merges WHERE id=?", mergeId))
      )
        throw error;
    }
  }
  return cartFor(userId);
}
export async function detail(id: string, userId?: string) {
  const order = await first(
    "SELECT * FROM orders WHERE id=?" + (userId ? " AND user_id=?" : ""),
    ...[id, ...(userId ? [userId] : [])],
  );
  assert(order, "Заказ не найден", 404);
  const items = await rows("SELECT * FROM order_items WHERE order_id=?", id);
  return {
    ...order,
    total: order.total / 100,
    paid_total: order.paid_total / 100,
    items: items.map((i) => ({
      ...i,
      price: i.price / 100,
      total: i.total / 100,
    })),
    history: await rows(
      "SELECT status,note,created_at FROM status_history WHERE order_id=? ORDER BY created_at,rowid",
      id,
    ),
  };
}
export async function checkout(user: any, input: any) {
  assert(
    typeof input.idempotencyKey === "string" &&
      /^[a-zA-Z0-9_-]{16,100}$/.test(input.idempotencyKey),
    "Неверный ключ операции",
  );
  const existing = await first(
    "SELECT id FROM orders WHERE user_id=? AND idempotency_key=?",
    user.user_id,
    input.idempotencyKey,
  );
  if (existing) return detail(existing.id, user.user_id);
  assert(["kaspi", "card"].includes(input.method), "Выберите способ оплаты");
  const profile = await first(
    "SELECT * FROM profiles WHERE user_id=?",
    user.user_id,
  );
  assert(profile?.name, "Укажите ФИО перед оплатой");
  const cartState = await first(
    "SELECT revision FROM carts WHERE id=?",
    user.user_id,
  );
  const items = await rows(
    `SELECT c.quantity,p.*,b.name AS brand,COALESCE(i.url,'') AS image FROM cart_items c JOIN products p ON p.id=c.product_id JOIN brands b ON b.id=p.brand_id LEFT JOIN product_images i ON i.product_id=p.id WHERE c.cart_id=? AND c.quantity>0`,
    user.user_id,
  );
  assert(items.length, "Корзина пуста");
  for (const i of items)
    assert(
      i.active && i.quantity <= i.stock,
      `Недостаточно товара: ${i.name}`,
      409,
    );
  const total = items.reduce(
    (sum, i) =>
      sum + Math.round((i.price * i.quantity) / (i.unit === "kg" ? 2 : 1)),
    0,
  );
  assert(total > 0, "Неверная сумма");
  const payment = await paymentProvider().confirm({
    method: input.method,
    idempotencyKey: user.user_id + "_" + input.idempotencyKey,
    amount: total,
    testResult: input.testResult,
  });
  assert(payment.confirmed, "Оплата ещё не подтверждена", 409);
  const id = uid(),
    time = now();
  const statements = [
    stmt(
      "INSERT INTO orders(id,number,user_id,cart_version,store_id,idempotency_key,name,phone,contact,total,paid_total,status,created_at) VALUES (?,(SELECT COALESCE(MAX(number),1047)+1 FROM orders),?,?,'main',?,?,?,?,?,?,'paid',?)",
      id,
      user.user_id,
      cartState.revision,
      input.idempotencyKey,
      profile.name,
      user.phone,
      profile.contact,
      total,
      total,
      time,
    ),
  ];
  for (const item of items) {
    statements.push(
      stmt(
        "UPDATE products SET stock=stock-? WHERE id=?",
        item.quantity,
        item.id,
      ),
    );
    statements.push(
      stmt(
        "INSERT INTO order_items(id,order_id,product_id,name,brand,image,unit,price,quantity,total) VALUES (?,?,?,?,?,?,?,?,?,?)",
        uid(),
        id,
        item.id,
        item.name,
        item.brand,
        item.image,
        item.unit,
        item.price,
        item.quantity,
        Math.round((item.price * item.quantity) / (item.unit === "kg" ? 2 : 1)),
      ),
    );
    statements.push(
      stmt(
        "DELETE FROM cart_items WHERE cart_id=? AND product_id=? AND quantity=?",
        user.user_id,
        item.id,
        item.quantity,
      ),
    );
  }
  statements.push(
    stmt("UPDATE carts SET revision=revision+1 WHERE id=?", user.user_id),
  );
  statements.push(
    stmt(
      "INSERT INTO payments(id,order_id,provider,method,reference,amount,status,created_at) VALUES (?,?,'mock',?,?,?,'succeeded',?)",
      uid(),
      id,
      input.method,
      payment.reference,
      total,
      time,
    ),
  );
  statements.push(
    stmt(
      "INSERT INTO status_history(id,order_id,status,actor,created_at) VALUES (?,?,'paid',?,?)",
      uid(),
      id,
      user.user_id,
      time,
    ),
  );
  try {
    await database().batch(statements);
  } catch (e) {
    const duplicate = await first(
      "SELECT id FROM orders WHERE user_id=? AND (idempotency_key=? OR cart_version=?)",
      user.user_id,
      input.idempotencyKey,
      cartState.revision,
    );
    if (duplicate) return detail(duplicate.id, user.user_id);
    console.error("checkout transaction failed", e);
    throw new ApiError(
      409,
      "Состав корзины или остатки изменились. Обновите корзину.",
    );
  }
  return detail(id, user.user_id);
}
export async function transition(admin: any, id: string, input: any) {
  const order = await first("SELECT * FROM orders WHERE id=?", id);
  assert(order, "Заказ не найден", 404);
  assert(
    canTransition(order.status, input.status),
    "Такое изменение статуса недоступно",
    409,
  );
  assert(
    input.status !== "cancelled" ||
      (typeof input.reason === "string" && input.reason.trim().length >= 3),
    "Укажите причину отмены",
  );
  const operation = uid();
  const statements = [
    stmt(
      "UPDATE orders SET status=?,reason=?,revision=revision+1 WHERE id=? AND revision=?",
      input.status,
      input.reason || null,
      id,
      order.revision,
    ),
    stmt(
      "INSERT INTO status_history(id,order_id,status,actor,note,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1",
      operation,
      id,
      input.status,
      admin.admin_id,
      input.reason || null,
      now(),
    ),
  ];
  if (input.status === "cancelled") {
    const items = await rows(
      "SELECT product_id,quantity FROM order_items WHERE order_id=?",
      id,
    );
    for (const i of items)
      statements.push(
        stmt(
          "UPDATE products SET stock=stock+? WHERE id=? AND EXISTS(SELECT 1 FROM status_history WHERE id=?)",
          i.quantity,
          i.product_id,
          operation,
        ),
      );
    statements.push(
      stmt(
        "UPDATE payments SET status='refund_required' WHERE order_id=? AND EXISTS(SELECT 1 FROM status_history WHERE id=?)",
        id,
        operation,
      ),
    );
  }
  statements.push(
    stmt(
      "INSERT INTO audit_log(id,admin_id,action,entity_id,data,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM status_history WHERE id=?)",
      uid(),
      admin.admin_id,
      "order.status",
      id,
      JSON.stringify({
        from: order.status,
        to: input.status,
        reason: input.reason,
      }),
      now(),
      operation,
    ),
  );
  await database().batch(statements);
  assert(
    await first("SELECT id FROM status_history WHERE id=?", operation),
    "Заказ уже изменён. Обновите страницу.",
    409,
  );
  return detail(id);
}

import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  ApiError,
  assert,
  database,
  first,
  rows,
  stmt,
  uid,
  now,
} from "@/lib/server/db";
import {
  guardOrigin,
  rateLimit,
  hash,
  secretHash,
  passwordHash,
  equal,
  identity,
  requireUser,
  requireAdmin,
  sessionCookie,
  phoneNumber,
  isMock,
  settings,
} from "@/lib/server/security";
import { whatsAppProvider } from "@/lib/server/providers";
import { catalog, searchCatalog } from "@/lib/server/catalog";
import { importCatalog } from "@/lib/server/catalog-import";
import {
  cartFor,
  setCart,
  checkout,
  detail,
  transition,
} from "@/lib/server/orders";
import { normalize } from "@/lib/domain";
import { boundedBody, jsonBody } from "@/lib/server/request";
export const dynamic = "force-dynamic";
const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
async function handle(req: Request) {
  try {
    guardOrigin(req);
    const url = new URL(req.url),
      path = url.pathname.replace(/^\/api\//, ""),
      method = req.method;
    const ip = req.headers.get("cf-connecting-ip") || "local";
    const body: any =
      method === "GET" || req.headers.get("content-type")?.includes("multipart")
        ? {}
        : await jsonBody(req);
    if (path === "catalog" && method === "GET")
      return json({
        products: await searchCatalog(url.searchParams),
        categories: await rows(
          "SELECT * FROM categories ORDER BY position,name",
        ),
        brands: await rows("SELECT * FROM brands ORDER BY name"),
        storePhone: settings().STORE_PHONE || "",
        mock: isMock(),
      });
    if (path === "me" && method === "GET") {
      const s = await identity(req);
      return json({
        user: s?.user_id
          ? {
              id: s.user_id,
              phone: s.phone,
              name: s.name,
              contact: s.contact,
              guest: !!s.guest,
            }
          : null,
        admin: s?.admin_id ? { login: s.login } : null,
        mock: isMock(),
      });
    }
    if (path === "auth/guest" && method === "POST") {
      await rateLimit("guest-ip:" + ip, 30, 3600);
      const data = z
        .object({
          name: z.string().trim().min(3, "Укажите имя").max(120),
          phone: z.string().max(30),
          contact: z.string().max(30).optional(),
        })
        .parse(body);
      const phone = phoneNumber(data.phone);
      const contact = data.contact ? phoneNumber(data.contact) : null;
      const session = await identity(req);
      assert(!session?.user_id || session.guest, "Вы уже вошли в аккаунт", 409);
      const id = session?.user_id || uid();
      // Unverified numbers are contact details, never account lookup keys.
      await database().batch([
        stmt(
          "INSERT INTO users(id,phone,guest,guest_phone,created_at) VALUES (?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET guest_phone=excluded.guest_phone",
          id,
          "guest:" + id,
          phone,
          now(),
        ),
        stmt(
          "INSERT INTO profiles(user_id,name,contact) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,contact=excluded.contact",
          id,
          data.name,
          contact,
        ),
      ]);
      await cartFor(id);
      return json(
        { ok: true },
        200,
        session?.user_id
          ? {}
          : {
              "Set-Cookie": await sessionCookie(req, id, null),
            },
      );
    }
    if (path === "auth/send" && method === "POST") {
      await rateLimit("otp-ip:" + ip, 10, 3600);
      const phone = phoneNumber(z.string().max(30).parse(body.phone));
      await rateLimit("otp-cooldown:" + phone, 1, 60);
      await rateLimit("otp-phone:" + phone, 5, 3600);
      const id = uid(),
        array = new Uint32Array(1);
      crypto.getRandomValues(array);
      const code = String(1000 + (array[0] % 9000));
      await database().batch([
        stmt("UPDATE challenges SET consumed=1 WHERE phone=?", phone),
        stmt(
          "INSERT INTO challenges(id,phone,code_hash,expires,created_at) VALUES (?,?,?,?,?)",
          id,
          phone,
          await secretHash(id + code),
          now() + 300,
          now(),
        ),
      ]);
      await whatsAppProvider().sendOtp(phone, code);
      return json({
        challengeId: id,
        expiresIn: 300,
        cooldown: 60,
        ...(isMock() ? { developmentCode: code } : {}),
      });
    }
    if (path === "auth/verify" && method === "POST") {
      await rateLimit("verify-ip:" + ip, 30, 600);
      const { challengeId, code } = z
        .object({
          challengeId: z.string().uuid(),
          code: z.string().regex(/^\d{4}$/),
        })
        .parse(body);
      const challenge = await stmt(
        "UPDATE challenges SET attempts=attempts+1 WHERE id=? AND consumed=0 AND expires>? AND attempts<5 RETURNING *",
        challengeId,
        now(),
      ).first<any>();
      assert(
        challenge,
        "Код истёк или попытки закончились. Запросите новый код.",
        400,
      );
      assert(
        equal(challenge.code_hash, await secretHash(challengeId + code)),
        "Неверный код. Попробуйте ещё раз.",
      );
      const consumed = await stmt(
        "UPDATE challenges SET consumed=1 WHERE id=? AND consumed=0 RETURNING id",
        challengeId,
      ).first();
      assert(consumed, "Код уже использован");
      await stmt(
        "INSERT OR IGNORE INTO users(id,phone,created_at) VALUES (?,?,?)",
        uid(),
        challenge.phone,
        now(),
      ).run();
      const user = await first(
        "SELECT id FROM users WHERE phone=?",
        challenge.phone,
      );
      await cartFor(user.id);
      return json({ ok: true }, 200, {
        "Set-Cookie": await sessionCookie(req, user.id, null),
      });
    }
    if (path === "auth/logout" && method === "POST") {
      const s = await identity(req);
      if (s)
        await stmt(
          "DELETE FROM sessions WHERE token_hash=?",
          s.token_hash,
        ).run();
      return json({ ok: true }, 200, {
        "Set-Cookie":
          "astra_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      });
    }
    if (path === "profile" && method === "PUT") {
      const user = await requireUser(req);
      const data = z
        .object({
          name: z.string().trim().min(3, "Укажите ФИО").max(120),
          contact: z.string().max(30).optional(),
        })
        .parse(body);
      const contact = data.contact ? phoneNumber(data.contact) : null;
      await stmt(
        "INSERT INTO profiles(user_id,name,contact) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,contact=excluded.contact",
        user.user_id,
        data.name,
        contact,
      ).run();
      return json({ ok: true });
    }
    if (path === "cart") {
      const user = await requireUser(req);
      if (method === "GET") return json({ cart: await cartFor(user.user_id) });
      if (method === "PUT")
        return json({ cart: await setCart(user.user_id, body.items) });
      if (method === "POST")
        return json({
          cart: await setCart(user.user_id, body.items, true, body.mergeKey),
        });
    }
    if (path === "checkout" && method === "POST") {
      const user = await requireUser(req);
      await rateLimit("checkout:" + user.user_id, 20, 60);
      return json(await checkout(user, body));
    }
    if (path === "orders" && method === "GET") {
      const user = await requireUser(req);
      return json({
        orders: (
          await rows(
            "SELECT id,number,status,total,created_at FROM orders WHERE user_id=? ORDER BY created_at DESC,rowid DESC",
            user.user_id,
          )
        ).map((o) => ({ ...o, total: o.total / 100 })),
      });
    }
    if (path.startsWith("orders/") && method === "GET") {
      const user = await requireUser(req);
      return json(await detail(path.split("/")[1], user.user_id));
    }
    if (path === "admin/login" && method === "POST") {
      await rateLimit("admin-ip:" + ip, 8, 900);
      const data = z
        .object({
          login: z.string().min(1).max(100),
          password: z.string().min(1).max(200),
        })
        .parse(body);
      const admin = await first(
        "SELECT * FROM admins WHERE login=?",
        data.login,
      );
      const derived = await passwordHash(
        data.password,
        admin?.salt || "invalid-account-salt",
      );
      assert(
        admin && equal(admin.password_hash, derived),
        "Неверный логин или пароль",
        401,
      );
      return json({ ok: true }, 200, {
        "Set-Cookie": await sessionCookie(req, null, admin.id),
      });
    }
    if (path.startsWith("admin/")) {
      const admin = await requireAdmin(req);
      const audit = (action: string, id: string, data: unknown) =>
        stmt(
          "INSERT INTO audit_log(id,admin_id,action,entity_id,data,created_at) VALUES (?,?,?,?,?,?)",
          uid(),
          admin.admin_id,
          action,
          id,
          JSON.stringify(data),
          now(),
        );
      if (path === "admin/catalog/import" && method === "POST") {
        return json(
          await importCatalog(body, (data) =>
            audit("catalog.import", "main", data),
          ),
        );
      }
      if (path === "admin/orders" && method === "GET") {
        return json({
          orders: (
            await rows(
              "SELECT * FROM orders ORDER BY created_at DESC,rowid DESC",
            )
          ).map((o) => ({ ...o, total: o.total / 100 })),
        });
      }
      if (/^admin\/orders\/[^/]+$/.test(path)) {
        const id = path.split("/")[2];
        if (method === "GET") return json(await detail(id));
        if (method === "PATCH") return json(await transition(admin, id, body));
      }
      if (/^admin\/orders\/[^/]+\/adjust$/.test(path) && method === "POST") {
        const id = path.split("/")[2];
        const data = z
          .object({
            reason: z.string().trim().min(3).max(500),
            items: z
              .array(
                z.object({
                  productId: z.string(),
                  quantity: z.number().int().min(1).max(999),
                }),
              )
              .min(1)
              .max(100),
          })
          .parse(body);
        assert(
          new Set(data.items.map((i) => i.productId)).size ===
            data.items.length,
          "Товары не должны повторяться",
        );
        const order = await first("SELECT * FROM orders WHERE id=?", id);
        assert(
          order && ["paid", "assembling", "ready"].includes(order.status),
          "Заказ нельзя редактировать",
          409,
        );
        const old = await rows(
          "SELECT * FROM order_items WHERE order_id=?",
          id,
        );
        const replacement = [];
        for (const item of data.items) {
          const prior = old.find((i) => i.product_id === item.productId);
          const product = await first(
            "SELECT p.*,b.name AS brand,COALESCE(i.url,'') AS image FROM products p JOIN brands b ON b.id=p.brand_id LEFT JOIN product_images i ON i.product_id=p.id WHERE p.id=?",
            item.productId,
          );
          assert(product, "Товар не найден");
          replacement.push({
            ...product,
            ...(prior
              ? {
                  name: prior.name,
                  brand: prior.brand,
                  image: prior.image,
                  unit: prior.unit,
                  price: prior.price,
                }
              : {}),
            quantity: item.quantity,
          });
        }
        const total = replacement.reduce(
          (sum, i) =>
            sum +
            Math.round((i.price * i.quantity) / (i.unit === "kg" ? 2 : 1)),
          0,
        );
        const op = uid();
        const queries = [
          stmt(
            "UPDATE orders SET total=?,revision=revision+1 WHERE id=? AND revision=?",
            total,
            id,
            order.revision,
          ),
          stmt(
            "INSERT INTO audit_log(id,admin_id,action,entity_id,data,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1",
            op,
            admin.admin_id,
            "order.adjust",
            id,
            JSON.stringify({
              reason: data.reason,
              before: old,
              after: replacement,
            }),
            now(),
          ),
        ];
        const exists = "EXISTS(SELECT 1 FROM audit_log WHERE id=?)";
        for (const item of old)
          queries.push(
            stmt(
              "UPDATE products SET stock=stock+? WHERE id=? AND " + exists,
              item.quantity,
              item.product_id,
              op,
            ),
          );
        queries.push(
          stmt(
            "DELETE FROM order_items WHERE order_id=? AND " + exists,
            id,
            op,
          ),
        );
        for (const item of replacement) {
          queries.push(
            stmt(
              "UPDATE products SET stock=stock-? WHERE id=? AND " + exists,
              item.quantity,
              item.id,
              op,
            ),
          );
          queries.push(
            stmt(
              "INSERT INTO order_items(id,order_id,product_id,name,brand,image,unit,price,quantity,total) SELECT ?,?,?,?,?,?,?,?,?,? WHERE " +
                exists,
              uid(),
              id,
              item.id,
              item.name,
              item.brand,
              item.image,
              item.unit,
              item.price,
              item.quantity,
              Math.round(
                (item.price * item.quantity) / (item.unit === "kg" ? 2 : 1),
              ),
              op,
            ),
          );
        }
        queries.push(
          stmt(
            "INSERT INTO status_history(id,order_id,status,actor,note,created_at) SELECT ?,?,?,?,?,? WHERE " +
              exists,
            uid(),
            id,
            order.status,
            admin.admin_id,
            data.reason,
            now(),
            op,
          ),
        );
        await database().batch(queries);
        assert(
          await first("SELECT id FROM audit_log WHERE id=?", op),
          "Заказ уже изменён",
          409,
        );
        return json(await detail(id));
      }
      if (path === "admin/categories") {
        if (method === "GET")
          return json({
            categories: await rows(
              "SELECT * FROM categories ORDER BY position",
            ),
          });
        if (method === "POST" || method === "PUT") {
          const d = z
            .object({
              id: z.string().optional(),
              name: z.string().trim().min(2).max(80),
              parent_id: z.string().nullable(),
              position: z.number().int().min(0).max(999),
            })
            .parse(body);
          const id = d.id || uid();
          if (d.parent_id) {
            const parent = await first(
              "SELECT * FROM categories WHERE id=?",
              d.parent_id,
            );
            assert(
              parent && !parent.parent_id && d.parent_id !== id,
              "Допустимы только два уровня категорий",
            );
            assert(
              !(await first("SELECT id FROM categories WHERE parent_id=?", id)),
              "Категория с подкатегориями не может стать подкатегорией",
            );
          }
          await database().batch([
            stmt(
              "INSERT INTO categories(id,name,parent_id,position,icon) VALUES (?,?,?,?,'basket') ON CONFLICT(id) DO UPDATE SET name=excluded.name,parent_id=excluded.parent_id,position=excluded.position",
              id,
              d.name,
              d.parent_id,
              d.position,
            ),
            audit("category.save", id, d),
          ]);
          return json({ ok: true });
        }
      }
      if (path.startsWith("admin/categories/") && method === "DELETE") {
        const id = path.split("/")[2];
        assert(
          !(await first("SELECT id FROM categories WHERE parent_id=?", id)) &&
            !(await first("SELECT id FROM products WHERE category_id=?", id)),
          "Сначала перенесите товары и подкатегории",
        );
        await database().batch([
          stmt("DELETE FROM categories WHERE id=?", id),
          audit("category.delete", id, {}),
        ]);
        return json({ ok: true });
      }
      if (path === "admin/products" && method === "GET")
        return json({ products: await catalog() });
      if (
        path === "admin/products" &&
        (method === "PUT" || method === "POST")
      ) {
        const d = z
          .object({
            id: z.string().optional(),
            name: z.string().trim().min(2).max(150),
            brand_id: z.string(),
            category_id: z.string(),
            description: z.string().max(500),
            details: z.string().max(160),
            unit: z.enum(["piece", "kg"]),
            price: z.number().positive().max(10000000),
            stock: z.number().int().min(0).max(999999),
          })
          .parse(body);
        const id = d.id || uid();
        const current = await first("SELECT unit FROM products WHERE id=?", id);
        assert(
          !current || current.unit === d.unit,
          "Единицу существующего товара менять нельзя. Создайте новый товар.",
        );
        assert(
          await first("SELECT id FROM categories WHERE id=?", d.category_id),
          "Выберите категорию",
        );
        assert(
          await first("SELECT id FROM brands WHERE id=?", d.brand_id),
          "Выберите бренд",
        );
        await database().batch([
          stmt(
            "INSERT INTO products(id,store_id,category_id,brand_id,name,description,details,price,unit,stock,search) VALUES (?,'main',?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id,brand_id=excluded.brand_id,name=excluded.name,description=excluded.description,details=excluded.details,price=excluded.price,unit=excluded.unit,stock=excluded.stock,search=excluded.search",
            id,
            d.category_id,
            d.brand_id,
            d.name,
            d.description,
            d.details,
            Math.round(d.price * 100),
            d.unit,
            d.stock,
            normalize(d.name + " " + d.description + " " + d.details),
          ),
          audit("product.save", id, d),
        ]);
        return json({ ok: true, id });
      }
      if (path === "admin/brands" && method === "POST") {
        const name = z.string().trim().min(2).max(80).parse(body.name);
        const id = uid();
        await database().batch([
          stmt("INSERT INTO brands(id,name) VALUES (?,?)", id, name),
          audit("brand.create", id, { name }),
        ]);
        return json({ ok: true });
      }
      if (/^admin\/products\/[^/]+\/image$/.test(path) && method === "POST") {
        const id = path.split("/")[2];
        assert(
          await first("SELECT id FROM products WHERE id=?", id),
          "Товар не найден",
          404,
        );
        const bytesBody = await boundedBody(req, 2_000_000);
        const form = await new Response(bytesBody, {
          headers: { "Content-Type": req.headers.get("content-type")! },
        }).formData();
        const file = form.get("file");
        assert(
          file instanceof File && file.size <= 1500000,
          "Загрузите фото до 1,5 МБ",
        );
        const bytes = new Uint8Array(await file.arrayBuffer());
        const valid =
          (bytes[0] === 255 && bytes[1] === 216) ||
          (bytes[0] === 137 && bytes[1] === 80) ||
          (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...bytes.slice(8, 12)) === "WEBP");
        assert(
          valid &&
            ["image/jpeg", "image/png", "image/webp"].includes(file.type),
          "Поддерживаются JPEG, PNG и WebP",
        );
        assert(env.BUCKET, "Хранилище недоступно", 503);
        const key = "products/" + uid();
        await env.BUCKET.put(key, bytes, {
          httpMetadata: { contentType: file.type },
        });
        await database().batch([
          stmt(
            "INSERT INTO product_images(product_id,url,object_key) VALUES (?,?,?) ON CONFLICT(product_id) DO UPDATE SET url=excluded.url,object_key=excluded.object_key",
            id,
            "/api/images/" + key,
            key,
          ),
          audit("product.image", id, { key }),
        ]);
        return json({ ok: true });
      }
      if (path === "admin/audit" && method === "GET")
        return json({
          events: await rows(
            "SELECT action,entity_id,data,created_at FROM audit_log ORDER BY created_at DESC LIMIT 100",
          ),
        });
    }
    if (path.startsWith("images/") && method === "GET") {
      assert(env.BUCKET, "Хранилище недоступно", 503);
      const object = await env.BUCKET.get(path.slice(7));
      assert(object, "Фото не найдено", 404);
      return new Response(object.body, {
        headers: {
          "Content-Type": object.httpMetadata?.contentType || "image/webp",
          "Cache-Control": "public,max-age=31536000,immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    throw new ApiError(404, "Страница не найдена");
  } catch (error) {
    if (error instanceof ApiError)
      return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return json(
        { error: error.issues[0]?.message || "Проверьте введённые данные" },
        400,
      );
    console.error("API request failed", error);
    return json(
      { error: "Не удалось выполнить запрос. Попробуйте ещё раз." },
      500,
    );
  }
}
export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};

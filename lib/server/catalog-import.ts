import { z } from "zod";
import { assert, database, first, stmt, uid } from "./db";
import { normalize } from "../domain";

// Explicit adapter contract, NOT a native 1C/CommerceML format.
const catalogInput = z
  .object({
    format: z.literal("astrakhan-catalog-v1"),
    replaceCatalog: z.boolean().default(false),
    products: z
      .array(
        z
          .object({
            externalId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
            name: z.string().trim().min(1).max(160),
            categoryId: z.string().min(1).max(80),
            brand: z.string().trim().min(1).max(100),
            price: z
              .number()
              .positive()
              .max(10000000)
              .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001),
            unit: z.enum(["piece", "kg"]),
            stock: z.number().int().min(0).max(999),
            description: z.string().max(1000).default(""),
            details: z.string().max(160).default(""),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

export async function importCatalog(
  body: unknown,
  audit: (data: unknown) => ReturnType<typeof stmt>,
) {
  const data = catalogInput.parse(body);
  assert(
    new Set(data.products.map((p) => p.externalId)).size ===
      data.products.length,
    "Повторяются идентификаторы товаров",
  );
  const statements: ReturnType<typeof stmt>[] = [];
  // Keep historical orders and photos; replacement only changes storefront visibility.
  if (data.replaceCatalog)
    statements.push(stmt("UPDATE products SET active=0 WHERE store_id='main'"));
  for (const p of data.products) {
    assert(
      await first("SELECT id FROM categories WHERE id=?", p.categoryId),
      "Не найдена категория: " + p.categoryId,
    );
    const id = "import-" + p.externalId;
    const prior = await first("SELECT unit FROM products WHERE id=?", id);
    assert(
      !prior || prior.unit === p.unit,
      "Нельзя менять единицу существующего товара: " + p.name,
    );
    statements.push(
      stmt(
        "INSERT OR IGNORE INTO brands(id,name) VALUES (?,?)",
        uid(),
        p.brand,
      ),
    );
    statements.push(
      stmt(
        `INSERT INTO products(id,store_id,external_id,category_id,brand_id,name,description,details,price,unit,stock,search,active)
      VALUES (?,'main',?,?,(SELECT id FROM brands WHERE name=?),?,?,?,?,?,?,?,1)
      ON CONFLICT(id) DO UPDATE SET external_id=excluded.external_id,category_id=excluded.category_id,brand_id=excluded.brand_id,name=excluded.name,description=excluded.description,details=excluded.details,price=excluded.price,stock=excluded.stock,search=excluded.search,active=1`,
        id,
        p.externalId,
        p.categoryId,
        p.brand,
        p.name,
        p.description,
        p.details,
        Math.round(p.price * 100),
        p.unit,
        p.stock,
        normalize([p.name, p.brand, p.description, p.details].join(" ")),
      ),
    );
  }
  statements.push(
    audit({ count: data.products.length, replaceCatalog: data.replaceCatalog }),
  );
  await database().batch(statements);
  return {
    imported: data.products.length,
    stockUnits: data.products.reduce((n, p) => n + p.stock, 0),
  };
}

import { rows } from "./db";
import { matchesSearch } from "../domain";
export async function catalog() {
  return rows(
    `SELECT p.id,p.name,p.brand_id,p.category_id,p.description,p.details,p.price/100.0 AS price,p.unit,p.stock,b.name AS brand,COALESCE(i.url,'') AS image FROM products p JOIN brands b ON b.id=p.brand_id LEFT JOIN product_images i ON i.product_id=p.id WHERE p.active=1 AND p.store_id='main' ORDER BY p.rowid`,
  );
}
export async function searchCatalog(params: URLSearchParams) {
  let products = await catalog();
  const query = (params.get("q") || "").slice(0, 160);
  if (query)
    products = products.filter((p) =>
      matchesSearch(
        `${p.name} ${p.brand} ${p.description} ${p.details}`,
        query,
      ),
    );
  const category = params.get("category");
  if (category) {
    const children = await rows(
      "SELECT id FROM categories WHERE parent_id=?",
      category,
    );
    products = products.filter(
      (p) =>
        p.category_id === category ||
        children.some((c) => c.id === p.category_id),
    );
  }
  if (params.get("brand"))
    products = products.filter((p) => p.brand_id === params.get("brand"));
  if (params.get("sort"))
    products.sort(
      (a, b) => (a.price - b.price) * (params.get("sort") === "desc" ? -1 : 1),
    );
  return products;
}

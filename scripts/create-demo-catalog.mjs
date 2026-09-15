import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
// Invented assortment/prices for integration development, not a real 1C database.
const assortment = [
  ["Молоко 2,5%", "Простоквашино", "milk", 650, "930 мл"],
  ["Молоко 3,2%", "Простоквашино", "milk", 690, "930 мл"],
  ["Молоко безлактозное", "Lactel", "milk", 990, "1 л"],
  ["Кефир 2,5%", "Простоквашино", "kefir", 680, "930 г"],
  ["Кефир 1%", "FoodMaster", "kefir", 620, "900 г"],
  ["Йогурт клубничный", "FoodMaster", "yogurt", 390, "125 г"],
  ["Йогурт натуральный", "Активиа", "yogurt", 550, "150 г"],
  ["Сыр Гауда", "Фермерское", "cheese", 1490, "Упаковка 200 г"],
  ["Сыр сливочный", "Hochland", "cheese", 1290, "140 г"],
  ["Сметана 20%", "Простоквашино", "cream", 890, "300 г"],
  ["Творог 5%", "FoodMaster", "curd", 850, "200 г"],
  ["Масло сливочное 82,5%", "Президент", "butter", 1690, "180 г"],
  [
    "Помидоры фасованные",
    "Местный урожай",
    "vegetables",
    790,
    "Упаковка 500 г",
  ],
  ["Огурцы фасованные", "Местный урожай", "vegetables", 690, "Упаковка 500 г"],
  ["Картофель мытый", "Местный урожай", "vegetables", 750, "Сетка 2 кг"],
  ["Морковь фасованная", "Местный урожай", "vegetables", 390, "Упаковка 1 кг"],
  ["Яблоки красные", "Местный урожай", "fruits", 990, "Упаковка 1 кг"],
  ["Бананы", "Свежий выбор", "fruits", 1190, "Упаковка 1 кг"],
  ["Апельсины", "Свежий выбор", "fruits", 1290, "Упаковка 1 кг"],
  ["Филе куриное", "Кус Вкус", "chicken", 1990, "Лоток 500 г"],
  ["Голень куриная", "Кус Вкус", "chicken", 1490, "Лоток 700 г"],
  ["Фарш говяжий", "Фермерское", "beef", 2290, "Лоток 500 г"],
  ["Хлеб пшеничный", "Пекарня", "bread", 350, "500 г"],
  ["Хлеб ржаной", "Пекарня", "bread", 450, "400 г"],
  ["Батон нарезной", "Пекарня", "bread", 420, "350 г"],
  ["Вода негазированная", "Tassay", "water", 290, "1 л"],
  ["Вода газированная", "Tassay", "water", 390, "1,5 л"],
  ["Вода минеральная", "Сарыагаш", "water", 450, "1 л"],
  ["Средство для мытья посуды", "Fairy", "cleaning", 1190, "450 мл"],
  ["Мыло жидкое", "Palmolive", "cleaning", 990, "300 мл"],
];
const products = assortment.map(
  ([name, brand, categoryId, price, details], i) => ({
    externalId: `demo-${String(i + 1).padStart(3, "0")}`,
    name,
    brand,
    categoryId,
    price,
    details,
    unit: "piece",
    stock: 10,
    description: "Демонстрационный товар. Цена и остаток учебные.",
  }),
);
const data = { format: "astrakhan-catalog-v1", products };
fs.mkdirSync("public/demo", { recursive: true });
fs.mkdirSync(".local", { recursive: true });
fs.writeFileSync("public/demo/catalog.json", JSON.stringify(data, null, 2));
const db = new DatabaseSync(".local/demo-inventory.sqlite");
db.exec(
  "CREATE TABLE IF NOT EXISTS products (external_id TEXT PRIMARY KEY, name TEXT, brand TEXT, category_id TEXT, price_tiyn INTEGER, stock INTEGER, unit TEXT)",
);
const insert = db.prepare(
  "INSERT INTO products VALUES(?,?,?,?,?,?,?) ON CONFLICT(external_id) DO UPDATE SET name=excluded.name,brand=excluded.brand,category_id=excluded.category_id,price_tiyn=excluded.price_tiyn,stock=excluded.stock,unit=excluded.unit",
);
db.exec("BEGIN");
for (const p of products)
  insert.run(
    p.externalId,
    p.name,
    p.brand,
    p.categoryId,
    p.price * 100,
    p.stock,
    p.unit,
  );
db.exec("COMMIT");
db.close();
const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const total = products.reduce((sum, p) => sum + p.price * p.stock, 0);
fs.writeFileSync(
  "public/demo/catalog.html",
  `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ASTRAKHAN — демонстрационный каталог обмена</title><style>
*{box-sizing:border-box}body{font:16px system-ui;margin:0;background:#f5f4f1;color:#262a2d}main{max-width:1180px;margin:auto;padding:32px 20px}.brand{color:#c52e30;font-weight:900;letter-spacing:2px}h1{font-size:clamp(26px,4vw,40px);margin-bottom:12px}p{line-height:1.6;color:#626970}.stats{display:flex;flex-wrap:wrap;gap:16px;margin:28px 0}.stat{padding:20px;background:white;border-radius:16px;flex:1;min-width:180px}.stat strong{display:block;font-size:30px}a{color:#b42125}input{font:inherit;width:100%;padding:14px;border:1px solid #ddd;border-radius:10px;margin:20px 0}.table{overflow:auto;background:white;border-radius:16px}table{border-collapse:collapse;width:100%;white-space:nowrap}td,th{text-align:left;padding:14px 18px;border-bottom:1px solid #eee}th{font-size:13px;color:#70767b}td:nth-child(4),td:nth-child(5){text-align:right}.note{padding:16px;border-left:4px solid #c52e30;background:#fff}nav{display:flex;gap:24px;flex-wrap:wrap}</style>
<main><div class="brand">ASTRAKHAN</div><h1>Демонстрационный каталог обмена</h1><p class="note">Учебные данные для проверки магазина. Это отдельный каталог и SQLite-база, а не информационная база платформы 1С. Подключение настоящей 1С ещё не выполнено.</p><div class="stats"><div class="stat"><strong>30</strong>наименований</div><div class="stat"><strong>300 шт.</strong>общий остаток</div><div class="stat"><strong>${total.toLocaleString("ru-RU")} ₸</strong>стоимость остатков</div></div><nav><a href="catalog.json" download>Скачать файл обмена JSON</a><a href="/admin">Открыть админку магазина</a><a href="/">Посмотреть витрину</a></nav><label for="search">Поиск товара или артикула</label><input id="search" type="search" placeholder="Например: молоко или demo-001"><div class="table"><table><thead><tr><th>Код</th><th>Товар</th><th>Бренд / фасовка</th><th>Цена</th><th>Остаток</th></tr></thead><tbody>${products.map((p) => `<tr><td>${p.externalId}</td><td>${escape(p.name)}</td><td>${escape(p.brand)} · ${escape(p.details)}</td><td>${p.price.toLocaleString("ru-RU")} ₸</td><td>10 шт.</td></tr>`).join("")}</tbody></table></div><p>Фото загружаются через админку сайта и не входят в файл обмена. Повторная загрузка использует постоянные коды товаров.</p></main><script>document.querySelector('#search').addEventListener('input',e=>{const q=e.target.value.toLocaleLowerCase('ru');document.querySelectorAll('tbody tr').forEach(r=>r.hidden=!r.textContent.toLocaleLowerCase('ru').includes(q))})</script></html>`,
);
console.log(
  `Created demo catalog: ${products.length} products, ${products.reduce((n, p) => n + p.stock, 0)} pieces; value ${total} KZT`,
);

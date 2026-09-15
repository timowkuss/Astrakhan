import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
export const stores = sqliteTable("stores", {
  id: text().primaryKey(),
  name: text().notNull(),
  timezone: text().notNull().default("Asia/Almaty"),
});
export const users = sqliteTable("users", {
  id: text().primaryKey(),
  phone: text().notNull().unique(),
  guest: integer().notNull().default(0),
  guestPhone: text("guest_phone"),
  createdAt: integer("created_at").notNull(),
});
export const profiles = sqliteTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  name: text().notNull(),
  contact: text(),
});
export const admins = sqliteTable("admins", {
  id: text().primaryKey(),
  login: text().notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  salt: text().notNull(),
  createdAt: integer("created_at").notNull(),
});
export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").references(() => users.id),
  adminId: text("admin_id").references(() => admins.id),
  expires: integer().notNull(),
});
export const challenges = sqliteTable(
  "challenges",
  {
    id: text().primaryKey(),
    phone: text().notNull(),
    codeHash: text("code_hash").notNull(),
    expires: integer().notNull(),
    attempts: integer().notNull().default(0),
    consumed: integer().notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_challenge_phone").on(t.phone, t.createdAt)],
);
export const rateLimits = sqliteTable("rate_limits", {
  key: text().primaryKey(),
  count: integer().notNull(),
  reset: integer().notNull(),
});
export const categories = sqliteTable("categories", {
  id: text().primaryKey(),
  name: text().notNull(),
  parentId: text("parent_id"),
  position: integer().notNull().default(0),
  icon: text().notNull().default("basket"),
});
export const brands = sqliteTable("brands", {
  id: text().primaryKey(),
  name: text().notNull().unique(),
});
export const products = sqliteTable(
  "products",
  {
    id: text().primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    externalId: text("external_id"),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    name: text().notNull(),
    description: text().notNull(),
    details: text().notNull(),
    price: integer().notNull(),
    unit: text().notNull(),
    stock: integer().notNull(),
    search: text().notNull(),
    active: integer().notNull().default(1),
  },
  (t) => [
    index("idx_products_category").on(t.categoryId),
    index("idx_products_store").on(t.storeId),
  ],
);
export const productImages = sqliteTable("product_images", {
  productId: text("product_id")
    .primaryKey()
    .references(() => products.id),
  url: text().notNull(),
  objectKey: text("object_key"),
});
export const cartMerges = sqliteTable("cart_merges", {
  id: text().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at").notNull(),
});
export const carts = sqliteTable("carts", {
  id: text().primaryKey(),
  revision: integer().notNull().default(0),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  storeId: text("store_id")
    .notNull()
    .references(() => stores.id),
});
export const cartItems = sqliteTable(
  "cart_items",
  {
    id: text().primaryKey(),
    cartId: text("cart_id")
      .notNull()
      .references(() => carts.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer().notNull(),
  },
  (t) => [uniqueIndex("idx_cart_product").on(t.cartId, t.productId)],
);
export const orders = sqliteTable(
  "orders",
  {
    id: text().primaryKey(),
    cartVersion: integer("cart_version"),
    number: integer().notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    idempotencyKey: text("idempotency_key").notNull(),
    name: text().notNull(),
    phone: text().notNull(),
    contact: text(),
    total: integer().notNull(),
    paidTotal: integer("paid_total").notNull(),
    status: text().notNull(),
    createdAt: integer("created_at").notNull(),
    reason: text(),
    revision: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex("idx_order_cart_version").on(t.userId, t.cartVersion),
    uniqueIndex("idx_order_idempotency").on(t.userId, t.idempotencyKey),
    index("idx_orders_user").on(t.userId, t.createdAt),
    index("idx_orders_status").on(t.status, t.createdAt),
  ],
);
export const orderItems = sqliteTable(
  "order_items",
  {
    id: text().primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    name: text().notNull(),
    brand: text().notNull(),
    image: text().notNull(),
    unit: text().notNull(),
    price: integer().notNull(),
    quantity: integer().notNull(),
    total: integer().notNull(),
  },
  (t) => [index("idx_items_order").on(t.orderId)],
);
export const payments = sqliteTable("payments", {
  id: text().primaryKey(),
  orderId: text("order_id")
    .notNull()
    .unique()
    .references(() => orders.id),
  provider: text().notNull(),
  method: text().notNull(),
  reference: text().notNull().unique(),
  amount: integer().notNull(),
  status: text().notNull(),
  createdAt: integer("created_at").notNull(),
});
export const statusHistory = sqliteTable("status_history", {
  id: text().primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id),
  status: text().notNull(),
  actor: text().notNull(),
  note: text(),
  createdAt: integer("created_at").notNull(),
});
export const auditLog = sqliteTable("audit_log", {
  id: text().primaryKey(),
  adminId: text("admin_id")
    .notNull()
    .references(() => admins.id),
  action: text().notNull(),
  entityId: text("entity_id").notNull(),
  data: text().notNull(),
  createdAt: integer("created_at").notNull(),
});

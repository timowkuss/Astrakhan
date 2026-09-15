"use client";
import { useState, useEffect } from "react";
import {
  Package,
  Grid2X2,
  ShoppingBasket,
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Upload,
  ShieldCheck,
  LoaderCircle,
  History,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { Picker } from "@/components/shop/picker";
import {
  money,
  quantityLabel,
  statuses,
  canTransition,
  Product,
  Category,
} from "@/lib/domain";
export default function Admin({
  navigate,
  admin,
  onLogin,
  products,
  categories,
  brands,
}: {
  navigate: (s: string) => void;
  admin: any;
  onLogin: () => Promise<void>;
  products: Product[];
  categories: Category[];
  brands: any[];
}) {
  const [login, setLogin] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [tab, setTab] = useState("orders"),
    [orders, setOrders] = useState<any[]>([]),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<any>(null),
    [edit, setEdit] = useState<any>(null),
    [kind, setKind] = useState(""),
    [events, setEvents] = useState<any[]>([]),
    [reason, setReason] = useState(""),
    [adjustItems, setAdjustItems] = useState<any[]>([]),
    [addProduct, setAddProduct] = useState(""),
    [initial, setInitial] = useState(true);
  async function refresh() {
    try {
      if (admin) {
        setOrders((await api("admin/orders")).orders);
        if (tab === "audit") setEvents((await api("admin/audit")).events);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setInitial(false);
    }
  }
  useEffect(() => {
    void refresh();
    if (admin) {
      const timer = setInterval(refresh, 15000);
      return () => clearInterval(timer);
    }
  }, [admin, tab]);
  async function perform(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function status(status: string) {
    await perform(async () => {
      setSelected(
        await api("admin/orders/" + selected.id, "PATCH", { status, reason }),
      );
      setKind("");
      setReason("");
      await refresh();
      toast.success("Статус заказа обновлён");
    });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    await perform(async () => {
      if (kind === "category")
        await api("admin/categories", edit.id ? "PUT" : "POST", edit);
      if (kind === "product")
        await api("admin/products", edit.id ? "PUT" : "POST", edit);
      if (kind === "brand") await api("admin/brands", "POST", edit);
      setEdit(null);
      setKind("");
      await onLogin();
      toast.success("Изменения сохранены");
    });
  }
  async function upload(file: File, p: Product) {
    await perform(async () => {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b ? resolve(b) : reject(new Error("Не удалось обработать фото")),
          "image/webp",
          0.82,
        ),
      );
      const form = new FormData();
      form.set("file", blob, "product.webp");
      const response = await fetch("/api/admin/products/" + p.id + "/image", {
        method: "POST",
        body: form,
      });
      const result: any = await response.json();
      if (!response.ok) throw new Error(result.error);
      await onLogin();
      toast.success("Фото обновлено");
    });
  }
  if (!admin)
    return (
      <section className="auth-card">
        <div className="auth-icon">
          <ShieldCheck />
        </div>
        <h1>Вход для сотрудников</h1>
        <p className="muted">Панель управления ASTRAKHAN</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform(async () => {
              await api("admin/login", "POST", { login, password });
              setPassword("");
              await onLogin();
            });
          }}
        >
          <label>
            Логин
            <input
              autoComplete="username"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              required
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <Button className="primary-button" disabled={busy}>
            {busy ? <LoaderCircle className="spin" /> : "Войти в админ-панель"}
          </Button>
        </form>
        <button className="text-button" onClick={() => navigate("/")}>
          Вернуться в магазин
        </button>
      </section>
    );
  return (
    <div className="admin">
      <div className="page-title">
        <div>
          <p className="eyebrow">ПАНЕЛЬ МАГАЗИНА</p>
          <h1>Управление ASTRAKHAN</h1>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            void perform(async () => {
              await api("auth/logout", "POST", {});
              await onLogin();
            })
          }
        >
          <LogOut size={17} />
          Выйти
        </Button>
      </div>
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          setSelected(null);
        }}
      >
        <TabsList className="admin-tabs">
          <TabsTrigger value="orders">
            <Package size={17} />
            Заказы
          </TabsTrigger>
          <TabsTrigger value="products">
            <ShoppingBasket size={17} />
            Товары
          </TabsTrigger>
          <TabsTrigger value="categories">
            <Grid2X2 size={17} />
            Категории
          </TabsTrigger>
          <TabsTrigger value="audit">
            <History size={17} />
            Журнал
          </TabsTrigger>
        </TabsList>
        <TabsContent value="orders">
          {!selected ? (
            <>
              <div className="status-filters">
                {[
                  ["all", "Все"],
                  ["paid", "Оплачены"],
                  ["assembling", "Собираются"],
                  ["ready", "Готовы"],
                  ["received", "Получены"],
                  ["cancelled", "Отменены"],
                ].map(([s, label]) => (
                  <button
                    key={s}
                    className={filter === s ? "chosen" : ""}
                    onClick={() => setFilter(s)}
                  >
                    {label}
                    <span>
                      {s === "all"
                        ? orders.length
                        : orders.filter((o) => o.status === s).length}
                    </span>
                  </button>
                ))}
              </div>
              {initial ? (
                <div className="loading-block">Загружаем заказы…</div>
              ) : orders.filter((o) => filter === "all" || o.status === filter)
                  .length ? (
                <div className="admin-order-grid">
                  {orders
                    .filter((o) => filter === "all" || o.status === filter)
                    .map((o) => (
                      <button
                        className="admin-order"
                        key={o.id}
                        onClick={() =>
                          void perform(async () =>
                            setSelected(await api("admin/orders/" + o.id)),
                          )
                        }
                      >
                        <div>
                          <strong>№{o.number}</strong>
                          <span className={"status-pill " + o.status}>
                            {statuses[o.status]}
                          </span>
                        </div>
                        <h3>{o.name}</h3>
                        <p>{o.phone}</p>
                        {o.contact && <p>Доп.: {o.contact}</p>}
                        <div>
                          <span className="muted">
                            {new Date(o.created_at * 1000).toLocaleString(
                              "ru-RU",
                              { timeZone: "Asia/Almaty" },
                            )}
                          </span>
                          <b>{money(o.total)}</b>
                        </div>
                      </button>
                    ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Package />
                  <h2>Заказов пока нет</h2>
                  <p>Новые оплаченные заказы появятся здесь автоматически.</p>
                </div>
              )}
            </>
          ) : (
            <>
              <button className="back-link" onClick={() => setSelected(null)}>
                <ArrowLeft size={18} />
                Все заказы
              </button>
              <div className="page-title">
                <h2>Заказ №{selected.number}</h2>
                <span className={"status-pill " + selected.status}>
                  {statuses[selected.status]}
                </span>
              </div>
              <div className="checkout-layout">
                <div className="panel">
                  <h3>{selected.name}</h3>
                  <p>
                    WhatsApp:{" "}
                    <a href={"tel:" + selected.phone}>{selected.phone}</a>
                  </p>
                  {selected.contact && (
                    <p>
                      Дополнительный:{" "}
                      <a href={"tel:" + selected.contact}>{selected.contact}</a>
                    </p>
                  )}
                  <p className="muted">
                    {new Date(selected.created_at * 1000).toLocaleString(
                      "ru-RU",
                      { timeZone: "Asia/Almaty" },
                    )}
                  </p>
                  {selected.items.map((i: any) => (
                    <div className="receipt-row" key={i.id}>
                      <img src={i.image} alt={i.name} />
                      <div>
                        <b>{i.name}</b>
                        <p>
                          {quantityLabel(i.quantity, i.unit)} × {money(i.price)}
                        </p>
                      </div>
                      <b>{money(i.total)}</b>
                    </div>
                  ))}
                  <div className="summary-total">
                    <b>Итого</b>
                    <b>{money(selected.total)}</b>
                  </div>
                  <p>Оплачено: {money(selected.paid_total)}</p>
                  {selected.total !== selected.paid_total && (
                    <p className="test-notice">
                      Согласуйте с клиентом{" "}
                      {selected.total < selected.paid_total
                        ? "возврат"
                        : "доплату"}{" "}
                      {money(Math.abs(selected.total - selected.paid_total))}.
                      Автоматическое списание или возврат не выполняется.
                    </p>
                  )}
                  {selected.status === "cancelled" && (
                    <p className="test-notice">
                      Возврат {money(selected.paid_total)} требует отдельной
                      обработки. Причина: {selected.reason}
                    </p>
                  )}
                </div>
                <aside className="summary-card">
                  <h2>Действия</h2>
                  {[
                    ["assembling", "Начать сборку"],
                    ["ready", "Заказ готов"],
                    ["received", "Получен"],
                  ]
                    .filter(([s]) => canTransition(selected.status, s))
                    .map(([s, label]) => (
                      <Button
                        key={s}
                        disabled={busy}
                        className="primary-button"
                        onClick={() => void status(s)}
                      >
                        {label}
                      </Button>
                    ))}
                  {["paid", "assembling", "ready"].includes(
                    selected.status,
                  ) && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setKind("adjust");
                          setReason("");
                          setAdjustItems(
                            selected.items.map((i: any) => ({
                              productId: i.product_id,
                              quantity: i.quantity,
                            })),
                          );
                        }}
                      >
                        Изменить состав
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setKind("cancel");
                          setReason("");
                        }}
                      >
                        Отменить заказ
                      </Button>
                    </>
                  )}
                  <h3>История</h3>
                  {selected.history.map((h: any, i: number) => (
                    <div className="history-event" key={i}>
                      <strong>{statuses[h.status]}</strong>
                      <small>
                        {new Date(h.created_at * 1000).toLocaleString("ru-RU", {
                          timeZone: "Asia/Almaty",
                        })}
                      </small>
                      {h.note && <p>{h.note}</p>}
                    </div>
                  ))}
                </aside>
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value="products">
          <div className="page-title">
            <h2>
              Товары <span className="muted">{products.length}</span>
            </h2>
            <div className="button-row">
              <Button
                variant="outline"
                onClick={() => {
                  setKind("brand");
                  setEdit({ name: "" });
                }}
              >
                Добавить бренд
              </Button>
              <Button
                onClick={() => {
                  setKind("product");
                  setEdit({
                    name: "",
                    brand_id: brands[0]?.id,
                    category_id: categories.find((c) => c.parent_id)?.id,
                    description: "",
                    details: "",
                    price: 100,
                    unit: "piece",
                    stock: 0,
                  });
                }}
              >
                <Plus size={17} />
                Добавить товар
              </Button>
            </div>
          </div>
          <div className="admin-table">
            {products.map((p) => (
              <div className="admin-product" key={p.id}>
                <img src={p.image} alt={p.name} />
                <div>
                  <b>{p.name}</b>
                  <p>
                    {p.brand} · {p.details}
                  </p>
                </div>
                <strong>{money(p.price)}</strong>
                <span className="muted">
                  Остаток: {quantityLabel(p.stock, p.unit)}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={"Редактировать " + p.name}
                  onClick={() => {
                    setKind("product");
                    setEdit({ ...p });
                  }}
                >
                  <Pencil size={17} />
                </Button>
                <label
                  className="upload-button"
                  aria-label={"Загрузить фото " + p.name}
                >
                  <Upload size={18} />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy}
                    onChange={(e) => {
                      if (e.target.files?.[0])
                        void upload(e.target.files[0], p);
                    }}
                  />
                </label>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="categories">
          <div className="page-title">
            <h2>Категории</h2>
            <Button
              onClick={() => {
                setKind("category");
                setEdit({
                  name: "",
                  parent_id: null,
                  position: categories.length,
                });
              }}
            >
              <Plus size={17} />
              Добавить
            </Button>
          </div>
          <div className="panel">
            {categories
              .filter((c) => !c.parent_id)
              .flatMap((c) => [
                c,
                ...categories.filter((s) => s.parent_id === c.id),
              ])
              .map((c) => (
                <div
                  className={"admin-category " + (c.parent_id ? "nested" : "")}
                  key={c.id}
                >
                  <span className="muted">{c.position + 1}</span>
                  <strong>{c.name}</strong>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={"Изменить " + c.name}
                    onClick={() => {
                      setEdit({ ...c });
                      setKind("category");
                    }}
                  >
                    <Pencil size={17} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={"Удалить " + c.name}
                    onClick={() => {
                      setEdit(c);
                      setKind("delete-category");
                    }}
                  >
                    <Trash2 size={17} />
                  </Button>
                </div>
              ))}
          </div>
        </TabsContent>
        <TabsContent value="audit">
          <h2>Журнал действий</h2>
          <div className="panel">
            {events.length ? (
              events.map((e, i) => (
                <details className="audit-event" key={i}>
                  <summary>
                    {e.action} ·{" "}
                    {new Date(e.created_at * 1000).toLocaleString("ru-RU")}
                  </summary>
                  <pre>{JSON.stringify(JSON.parse(e.data), null, 2)}</pre>
                </details>
              ))
            ) : (
              <p className="muted">Действий пока нет</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
      <Dialog
        open={!!kind}
        onOpenChange={(open) => {
          if (!open) {
            setKind("");
            setEdit(null);
            setError("");
          }
        }}
      >
        <DialogContent className="edit-dialog">
          <DialogHeader>
            <DialogTitle>
              {
                {
                  category: edit?.id ? "Изменить категорию" : "Новая категория",
                  product: edit?.id ? "Изменить товар" : "Новый товар",
                  brand: "Новый бренд",
                  cancel: "Отмена заказа",
                  adjust: "Корректировка заказа",
                  "delete-category": "Удалить категорию?",
                }[kind]
              }
            </DialogTitle>
            <DialogDescription>
              {kind === "adjust"
                ? "Сначала согласуйте изменения с клиентом. Количество весового товара задаётся шагами по 0,5 кг."
                : kind === "cancel"
                  ? "Укажите согласованную причину отмены. Возврат оплаты обрабатывается отдельно."
                  : "Изменения сохраняются в базе магазина."}
            </DialogDescription>
          </DialogHeader>
          {["category", "product", "brand"].includes(kind) && edit && (
            <form onSubmit={save}>
              <label>
                Название
                <input
                  value={edit.name}
                  required
                  minLength={2}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </label>
              {kind === "category" && (
                <>
                  <label>
                    Родительская категория
                    <Picker
                      label="Родительская категория"
                      value={edit.parent_id || "none"}
                      onChange={(v) =>
                        setEdit({ ...edit, parent_id: v === "none" ? null : v })
                      }
                      items={[
                        { value: "none", label: "Главная категория" },
                        ...categories
                          .filter((c) => !c.parent_id && c.id !== edit.id)
                          .map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  </label>
                  <label>
                    Порядок (начиная с 0)
                    <input
                      type="number"
                      min="0"
                      max="999"
                      required
                      value={edit.position}
                      onChange={(e) =>
                        setEdit({ ...edit, position: Number(e.target.value) })
                      }
                    />
                  </label>
                </>
              )}
              {kind === "product" && (
                <>
                  <div className="form-columns">
                    <label>
                      Бренд
                      <Picker
                        label="Бренд товара"
                        value={edit.brand_id}
                        onChange={(v) => setEdit({ ...edit, brand_id: v })}
                        items={brands.map((b) => ({
                          value: b.id,
                          label: b.name,
                        }))}
                      />
                    </label>
                    <label>
                      Категория
                      <Picker
                        label="Категория товара"
                        value={edit.category_id}
                        onChange={(v) => setEdit({ ...edit, category_id: v })}
                        items={categories.map((c) => ({
                          value: c.id,
                          label: c.name,
                        }))}
                      />
                    </label>
                  </div>
                  <label>
                    Описание
                    <textarea
                      value={edit.description}
                      onChange={(e) =>
                        setEdit({ ...edit, description: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Характеристики
                    <input
                      value={edit.details}
                      onChange={(e) =>
                        setEdit({ ...edit, details: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Единица
                    <Picker
                      label="Единица измерения"
                      value={edit.unit}
                      onChange={(v) => setEdit({ ...edit, unit: v })}
                      items={[
                        { value: "piece", label: "Штучный" },
                        { value: "kg", label: "Весовой · шаг 0,5 кг" },
                      ]}
                    />
                  </label>
                  <div className="form-columns">
                    <label>
                      Цена за {edit.unit === "kg" ? "кг" : "шт."}, ₸
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={edit.price}
                        onChange={(e) =>
                          setEdit({ ...edit, price: Number(e.target.value) })
                        }
                        required
                      />
                    </label>
                    <label>
                      Остаток, {edit.unit === "kg" ? "кг" : "шт."}
                      <input
                        type="number"
                        min="0"
                        step={edit.unit === "kg" ? 0.5 : 1}
                        value={edit.stock / (edit.unit === "kg" ? 2 : 1)}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            stock:
                              Number(e.target.value) *
                              (edit.unit === "kg" ? 2 : 1),
                          })
                        }
                        required
                      />
                    </label>
                  </div>
                </>
              )}
              <Button className="primary-button" disabled={busy}>
                Сохранить
              </Button>
            </form>
          )}
          {kind === "cancel" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void status("cancelled");
              }}
            >
              <label>
                Причина
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={3}
                  required
                  placeholder="Клиент попросил отменить / товар отсутствует / другая причина"
                />
              </label>
              <Button variant="destructive" disabled={busy}>
                Отменить заказ
              </Button>
            </form>
          )}
          {kind === "delete-category" && (
            <>
              <p>
                Категория «{edit.name}» будет удалена. Категорию с товарами или
                подкатегориями удалить нельзя.
              </p>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await api("admin/categories/" + edit.id, "DELETE");
                    setKind("");
                    await onLogin();
                  })
                }
              >
                Удалить категорию
              </Button>
            </>
          )}
          {kind === "adjust" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  setSelected(
                    await api(
                      "admin/orders/" + selected.id + "/adjust",
                      "POST",
                      { items: adjustItems, reason },
                    ),
                  );
                  setKind("");
                  await refresh();
                  await onLogin();
                  toast.success("Заказ скорректирован");
                });
              }}
            >
              {adjustItems.map((i, index) => {
                const p = products.find((p) => p.id === i.productId);
                return (
                  <div className="adjust-row" key={i.productId}>
                    <span>{p?.name}</span>
                    <input
                      aria-label={"Количество " + p?.name}
                      type="number"
                      min={p?.unit === "kg" ? 0.5 : 1}
                      step={p?.unit === "kg" ? 0.5 : 1}
                      required
                      value={i.quantity / (p?.unit === "kg" ? 2 : 1)}
                      onChange={(e) =>
                        setAdjustItems(
                          adjustItems.map((v, j) =>
                            j === index
                              ? {
                                  ...v,
                                  quantity:
                                    Number(e.target.value) *
                                    (p?.unit === "kg" ? 2 : 1),
                                }
                              : v,
                          ),
                        )
                      }
                    />
                    <small>{p?.unit === "kg" ? "кг" : "шт."}</small>
                    <button
                      type="button"
                      aria-label={"Удалить позицию " + p?.name}
                      onClick={() =>
                        setAdjustItems(
                          adjustItems.filter((_, j) => j !== index),
                        )
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                );
              })}
              <div className="button-row">
                <Picker
                  label="Товар для замены"
                  value={addProduct || "none"}
                  onChange={setAddProduct}
                  items={[
                    { value: "none", label: "Добавить товар" },
                    ...products
                      .filter(
                        (p) => !adjustItems.some((i) => i.productId === p.id),
                      )
                      .map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
                <Button
                  type="button"
                  disabled={!addProduct || addProduct === "none"}
                  onClick={() => {
                    setAdjustItems([
                      ...adjustItems,
                      { productId: addProduct, quantity: 1 },
                    ]);
                    setAddProduct("");
                  }}
                >
                  <Plus size={17} />
                </Button>
              </div>
              <label>
                Согласованное решение
                <textarea
                  required
                  minLength={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="С кем и какие изменения согласованы"
                />
              </label>
              <Button
                disabled={busy || !adjustItems.length}
                className="primary-button"
              >
                Сохранить изменения
              </Button>
            </form>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Menu,
  ShoppingBasket,
  Search,
  UserRound,
  ChevronRight,
  ArrowLeft,
  Plus,
  Minus,
  Trash2,
  Check,
  Clock3,
  Package,
  Milk,
  Apple,
  Beef,
  Wheat,
  BottleWine,
  Sparkles,
  Grid2X2,
  LogOut,
  ShieldCheck,
  ArrowUpDown,
  X,
  LoaderCircle,
  WifiOff,
  Leaf,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Toaster, toast } from "sonner";
import {
  Product,
  Category,
  Cart,
  matchesSearch,
  money,
  lineTotal,
  quantityLabel,
  statuses,
} from "@/lib/domain";
import Admin from "./admin-ui";
import { api } from "@/lib/client-api";
import { Picker } from "@/components/shop/picker";
const icons: Record<string, any> = {
  milk: Milk,
  apple: Apple,
  beef: Beef,
  bread: Wheat,
  bottle: BottleWine,
  sparkles: Sparkles,
  basket: ShoppingBasket,
};
const guestKey = "astrakhan.guest.v1";
function readGuest(): Cart {
  try {
    const data = JSON.parse(localStorage.getItem(guestKey) || "{}");
    return Object.fromEntries(
      Object.entries(data).filter(
        ([_, v]) => Number.isInteger(v) && Number(v) > 0 && Number(v) <= 999,
      ),
    ) as Cart;
  } catch {
    return {};
  }
}
export function Quantity({
  product,
  q,
  onChange,
  disabled = false,
}: {
  product: Product;
  q: number;
  onChange: (q: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="quantity">
      <button
        aria-label={"Уменьшить " + product.name}
        disabled={disabled || q <= 0}
        onClick={() => onChange(q - 1)}
      >
        <Minus size={17} />
      </button>
      <span>{quantityLabel(q, product.unit)}</span>
      <button
        aria-label={"Увеличить " + product.name}
        disabled={disabled || q >= product.stock}
        onClick={() => onChange(q + 1)}
      >
        <Plus size={17} />
      </button>
    </div>
  );
}
export default function Storefront() {
  const router = useRouter();
  const currentPath = usePathname();
  const [path, setPath] = useState(currentPath || "/"),
    [products, setProducts] = useState<Product[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [brands, setBrands] = useState<any[]>([]),
    [user, setUser] = useState<any>(null),
    [admin, setAdmin] = useState<any>(null),
    [mock, setMock] = useState(false),
    [shopPhone, setShopPhone] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [offline, setOffline] = useState(false),
    [cart, setCart] = useState<Cart>({}),
    [cartBusy, setCartBusy] = useState(false),
    [drawer, setDrawer] = useState(false),
    [category, setCategory] = useState("all"),
    [expanded, setExpanded] = useState("dairy"),
    [brand, setBrand] = useState("all"),
    [sort, setSort] = useState("default"),
    [query, setQuery] = useState(""),
    [suggest, setSuggest] = useState(false),
    [order, setOrder] = useState<any>(null),
    [orders, setOrders] = useState<any[]>([]),
    [orderLoading, setOrderLoading] = useState(false),
    [closed, setClosed] = useState(false);
  const [phone, setPhone] = useState("+7 "),
    [challenge, setChallenge] = useState<any>(null),
    [code, setCode] = useState(""),
    [authError, setAuthError] = useState(""),
    [busy, setBusy] = useState(false),
    [cooldown, setCooldown] = useState(0),
    [expires, setExpires] = useState(0),
    [fullName, setFullName] = useState(""),
    [contact, setContact] = useState(""),
    [method, setMethod] = useState("kaspi"),
    [paymentError, setPaymentError] = useState(""),
    [testResult, setTestResult] = useState("success");
  const cartRef = useRef<Cart>({}),
    payLock = useRef(false),
    cartLock = useRef(false);
  const navigate = useCallback(
    (target: string) => {
      if (location.pathname !== target) router.push(target);
      setPath(target);
      window.scrollTo({ top: 0, behavior: "instant" });
      setDrawer(false);
      setError("");
    },
    [router],
  );
  useEffect(() => {
    if (currentPath) setPath(currentPath);
  }, [currentPath]);
  const updateCart = (next: Cart) => {
    cartRef.current = next;
    setCart(next);
  };
  const load = useCallback(async (failHard = false) => {
    setError("");
    try {
      const [data, me] = await Promise.all([api("catalog"), api("me")]);
      setProducts(data.products);
      setCategories(data.categories);
      setBrands(data.brands);
      setMock(data.mock);
      setShopPhone(data.storePhone);
      setUser(me.user);
      setAdmin(me.admin);
      setFullName(me.user?.name || "");
      if (me.user?.guest) setPhone(me.user.phone);
      setContact(me.user?.contact || "");
      if (me.user) {
        const guest = readGuest();
        let mergeKey = localStorage.getItem("astrakhan.merge");
        if (!mergeKey) {
          mergeKey = crypto.randomUUID();
          localStorage.setItem("astrakhan.merge", mergeKey);
        }
        const result = Object.keys(guest).length
          ? await api("cart", "POST", { items: guest, mergeKey })
          : await api("cart");
        updateCart(result.cart);
        localStorage.removeItem(guestKey);
      } else updateCart(readGuest());
    } catch (e: any) {
      setError(e.message);
      if (failHard) throw e;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setPath(location.pathname);
    void load();
    const pop = () => setPath(location.pathname);
    const status = () => setOffline(!navigator.onLine);
    const hours = () =>
      setClosed(
        Number(
          new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Almaty",
            hour: "2-digit",
            hourCycle: "h23",
          }).format(new Date()),
        ) < 8 ||
          Number(
            new Intl.DateTimeFormat("en-GB", {
              timeZone: "Asia/Almaty",
              hour: "2-digit",
              hourCycle: "h23",
            }).format(new Date()),
          ) >= 22,
      );
    hours();
    status();
    const timer = setInterval(hours, 60000);
    window.addEventListener("popstate", pop);
    window.addEventListener("online", status);
    window.addEventListener("offline", status);
    return () => {
      clearInterval(timer);
      window.removeEventListener("popstate", pop);
      window.removeEventListener("online", status);
      window.removeEventListener("offline", status);
    };
  }, [load]);
  useEffect(() => {
    if (!cooldown && !expires) return;
    const timer = setInterval(() => {
      setCooldown((v) => Math.max(0, v - 1));
      setExpires((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [!!cooldown, !!expires]);
  const refreshOrder = useCallback(async () => {
    if (!user) return;
    try {
      if (path === "/orders") setOrders((await api("orders")).orders);
      else if (path.startsWith("/orders/"))
        setOrder(await api("orders/" + path.split("/")[2]));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOrderLoading(false);
    }
  }, [path, user]);
  useEffect(() => {
    if (path === "/orders" || path.startsWith("/orders/")) {
      setOrder(null);
      setOrderLoading(true);
      void refreshOrder();
      const timer = setInterval(refreshOrder, 15000);
      return () => clearInterval(timer);
    }
  }, [path, refreshOrder]);
  async function change(product: Product, q: number) {
    if (cartLock.current) return;
    const before = { ...cartRef.current };
    const next = { ...before };
    if (q <= 0) delete next[product.id];
    else next[product.id] = Math.min(q, product.stock);
    cartLock.current = true;
    setCartBusy(true);
    updateCart(next);
    try {
      if (user)
        updateCart(
          (await api("cart", "PUT", { items: { [product.id]: q } })).cart,
        );
      else {
        localStorage.setItem(guestKey, JSON.stringify(next));
        localStorage.removeItem("astrakhan.merge");
      }
      if (!before[product.id] && q > 0)
        toast.success("Товар добавлен в корзину ✓");
      sessionStorage.removeItem("astrakhan.checkout");
    } catch (e: any) {
      updateCart(before);
      toast.error(e.message);
    } finally {
      cartLock.current = false;
      setCartBusy(false);
    }
  }
  function choose(id: string) {
    setCategory(id);
    setQuery("");
    setSuggest(false);
    navigate("/");
  }
  const cartProducts = products.filter((p) => cart[p.id] > 0),
    total = cartProducts.reduce(
      (sum, p) => sum + lineTotal(p.price, cart[p.id], p.unit),
      0,
    ),
    count = Object.values(cart).filter((q) => q > 0).length;
  const selected = categories.find((c) => c.id === category),
    parent = categories.find((c) => c.id === selected?.parent_id),
    rootId = parent?.id || selected?.id;
  const filtered = products
    .filter(
      (p) =>
        (category === "all" ||
          p.category_id === category ||
          categories.some(
            (c) => c.id === p.category_id && c.parent_id === category,
          )) &&
        (brand === "all" || p.brand_id === brand) &&
        matchesSearch(
          `${p.name} ${p.brand} ${p.description} ${p.details}`,
          query,
        ),
    )
    .sort((a, b) =>
      sort === "default" ? 0 : (a.price - b.price) * (sort === "desc" ? -1 : 1),
    );
  const suggestions = products
    .filter((p) =>
      matchesSearch(
        `${p.name} ${p.brand} ${p.description} ${p.details}`,
        query,
      ),
    )
    .slice(0, 4);
  const categoryMenu = (
    <div className="category-menu">
      <button
        className={category === "all" ? "active" : ""}
        onClick={() => choose("all")}
      >
        <Grid2X2 size={20} />
        Все продукты<span>{products.length}</span>
      </button>
      {categories
        .filter((c) => !c.parent_id)
        .map((c) => {
          const Icon = icons[c.icon] || ShoppingBasket;
          return (
            <div key={c.id}>
              <button
                className={rootId === c.id ? "active" : ""}
                onClick={() => {
                  setExpanded(expanded === c.id ? "" : c.id);
                  if (!drawer) choose(c.id);
                }}
              >
                <Icon size={20} />
                {c.name}
                <ChevronDown
                  className={expanded === c.id ? "rotated" : ""}
                  size={16}
                />
              </button>
              {expanded === c.id && (
                <div className="subcategories">
                  <button onClick={() => choose(c.id)}>Все</button>
                  {categories
                    .filter((sub) => sub.parent_id === c.id)
                    .map((sub) => (
                      <button
                        className={category === sub.id ? "chosen" : ""}
                        key={sub.id}
                        onClick={() => choose(sub.id)}
                      >
                        {sub.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setAuthError("");
    try {
      const result = await api("auth/send", "POST", { phone });
      setChallenge(result);
      setCooldown(result.cooldown);
      setExpires(result.expiresIn);
      setCode("");
    } catch (e: any) {
      setAuthError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setAuthError("");
    try {
      await api("auth/verify", "POST", {
        challengeId: challenge.challengeId,
        code,
      });
      await load();
      navigate(cartProducts.length ? "/checkout" : "/account");
    } catch (e: any) {
      setAuthError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (payLock.current) return;
    payLock.current = true;
    setBusy(true);
    setPaymentError("");
    try {
      if (!user || user.guest) {
        await api("auth/guest", "POST", { name: fullName, phone, contact });
        await load(true);
      } else if (!user.name)
        await api("profile", "PUT", { name: fullName, contact });
      let key = sessionStorage.getItem("astrakhan.checkout");
      if (!key) {
        key = crypto.randomUUID();
        sessionStorage.setItem("astrakhan.checkout", key);
      }
      const result = await api("checkout", "POST", {
        method,
        idempotencyKey: key,
        testResult,
      });
      setOrder(result);
      updateCart({});
      sessionStorage.removeItem("astrakhan.checkout");
      await load();
      navigate("/orders/" + result.id);
    } catch (e: any) {
      setPaymentError(e.message);
    } finally {
      payLock.current = false;
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api("auth/logout", "POST", {});
      setUser(null);
      setAdmin(null);
      updateCart(readGuest());
      navigate("/");
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  const cartList = (readonly = false) => (
    <div className="cart-list">
      {cartProducts.map((p) => (
        <article key={p.id} className="cart-row">
          <img src={p.image} alt={p.name} />
          <div className="cart-info">
            <small>{p.brand}</small>
            <h3>{p.name}</h3>
            <span className="muted">
              {money(p.price)} / {p.unit === "kg" ? "кг" : "шт."}
            </span>
            {readonly ? (
              <p>{quantityLabel(cart[p.id], p.unit)}</p>
            ) : (
              <Quantity
                product={p}
                q={cart[p.id]}
                onChange={(q) => void change(p, q)}
                disabled={cartBusy}
              />
            )}
          </div>
          <div className="cart-line-total">
            <strong>{money(lineTotal(p.price, cart[p.id], p.unit))}</strong>
            {!readonly && (
              <button
                className="icon-button muted"
                aria-label={"Удалить " + p.name}
                onClick={() => void change(p, 0)}
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
  return (
    <>
      <Toaster position="top-center" richColors />
      <header className="site-header">
        <div className="header-inner">
          <button
            className="icon-button mobile-menu"
            aria-label="Открыть категории"
            onClick={() => setDrawer(true)}
          >
            <Menu />
          </button>
          <button className="wordmark" onClick={() => navigate("/")}>
            ASTRAKHAN
          </button>
          <span className="header-description">Продукты на каждый день</span>
          <div className="header-spacer" />
          <div className="hours">
            <Clock3 size={17} />
            <div>
              Ежедневно <b>08:00–22:00</b>
            </div>
          </div>
          <button
            className="header-account"
            onClick={() => navigate(user ? "/account" : "/login")}
          >
            <UserRound size={20} />
            <span>{user?.name?.split(" ")[0] || "Войти"}</span>
          </button>
          <button
            className="header-cart"
            aria-label={`Корзина, ${count} позиций`}
            onClick={() => navigate("/cart")}
          >
            <ShoppingBasket size={22} />
            <span className="desktop">
              Корзина{total > 0 ? " · " + money(total) : ""}
            </span>
            {count > 0 && <b className="badge">{count}</b>}
          </button>
        </div>
      </header>
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="category-sheet">
          <SheetHeader>
            <SheetTitle className="wordmark">ASTRAKHAN</SheetTitle>
            <SheetDescription>Каталог продуктов</SheetDescription>
          </SheetHeader>
          {categoryMenu}
          <div className="drawer-foot">
            <Clock3 size={18} /> Ежедневно 08:00–22:00
          </div>
        </SheetContent>
      </Sheet>
      {offline && (
        <div className="offline">
          <WifiOff size={18} /> Нет интернета. Проверьте подключение — корзина
          сохранена.
        </div>
      )}
      <main className={"main " + (path === "/" ? "catalog-main" : "")}>
        {path.startsWith("/admin") ? (
          <Admin
            navigate={navigate}
            admin={admin}
            onLogin={load}
            products={products}
            categories={categories}
            brands={brands}
          />
        ) : (
          <>
            {path === "/" && (
              <>
                <div className="breadcrumb">
                  Магазин <ChevronRight size={13} /> Каталог
                </div>
                <div className="catalog-top">
                  <div>
                    <p className="eyebrow">ВСЁ, ЧТО НУЖНО ДОМА</p>
                    <h1>
                      Хорошие продукты.
                      <br className="mobile-break" /> Каждый день.
                    </h1>
                  </div>
                  <span className="catalog-note">
                    <Leaf size={18} /> Выбирайте с заботой о близких
                  </span>
                </div>
                <div className="search-wrap">
                  <form
                    className="search-box"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setSuggest(false);
                      setCategory("all");
                    }}
                  >
                    <Search size={22} />
                    <input
                      aria-label="Поиск продуктов"
                      placeholder="Найти молоко, хлеб или что-то ещё…"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setCategory("all");
                        setSuggest(true);
                      }}
                      onFocus={() => setSuggest(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setSuggest(false);
                      }}
                    />
                    {query && (
                      <button
                        type="button"
                        aria-label="Очистить поиск"
                        onClick={() => {
                          setQuery("");
                          setSuggest(false);
                        }}
                      >
                        <X size={19} />
                      </button>
                    )}
                    <kbd className="desktop">Поиск</kbd>
                  </form>
                  {suggest && query && (
                    <div className="autocomplete">
                      {suggestions.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setQuery(p.name);
                            setCategory("all");
                            setBrand("all");
                            setSuggest(false);
                          }}
                        >
                          <img src={p.image} alt="" />
                          <span>
                            {p.name}
                            <small>{p.brand}</small>
                          </span>
                          <b>{money(p.price)}</b>
                        </button>
                      ))}
                      {!suggestions.length && (
                        <p>По вашему запросу ничего не найдено</p>
                      )}
                      <button
                        className="all-results"
                        onClick={() => {
                          setCategory("all");
                          setSuggest(false);
                        }}
                      >
                        Показать все результаты <ChevronRight size={17} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="category-tiles">
                  {categories
                    .filter((c) => !c.parent_id)
                    .map((c) => {
                      const Icon = icons[c.icon] || ShoppingBasket;
                      return (
                        <button
                          key={c.id}
                          className={rootId === c.id ? "selected" : ""}
                          onClick={() => {
                            setExpanded(c.id);
                            choose(c.id);
                          }}
                        >
                          <span className={"tile-icon " + c.id}>
                            <Icon size={27} strokeWidth={1.5} />
                          </span>
                          <span>{c.name}</span>
                          <ChevronRight size={14} />
                        </button>
                      );
                    })}
                </div>
                {closed && (
                  <div className="closed-notice">
                    <Clock3 size={18} />
                    <span>
                      Магазин сейчас закрыт. Ваш заказ будет обработан с 08:00.
                    </span>
                  </div>
                )}
                <div className="catalog-layout">
                  <aside className="desktop-sidebar">
                    <h2>Категории</h2>
                    {categoryMenu}
                    <div className="sidebar-note">
                      <ShoppingBasket size={24} />
                      <p>
                        Соберём ваш заказ
                        <br />с вниманием к деталям
                      </p>
                      <span>Каждый день, 08:00–22:00</span>
                    </div>
                  </aside>
                  <section className="catalog-results">
                    <div className="catalog-toolbar">
                      <div>
                        <h2>
                          {query
                            ? "Результаты поиска"
                            : selected?.name || "Все продукты"}
                        </h2>
                        <span className="muted">{filtered.length} товаров</span>
                      </div>
                      <div className="filters">
                        <Picker
                          label="Бренд"
                          value={brand}
                          onChange={setBrand}
                          items={[
                            { value: "all", label: "Все бренды" },
                            ...brands.map((b) => ({
                              value: b.id,
                              label: b.name,
                            })),
                          ]}
                        />
                        <Picker
                          label="Сортировка цены"
                          value={sort}
                          onChange={setSort}
                          items={[
                            { value: "default", label: "По умолчанию" },
                            { value: "asc", label: "Сначала дешёвые" },
                            { value: "desc", label: "Сначала дорогие" },
                          ]}
                        />
                      </div>
                    </div>
                    {selected && !selected.parent_id && (
                      <div className="subchips">
                        <button
                          className="chosen"
                          onClick={() => choose(selected.id)}
                        >
                          Все
                        </button>
                        {categories
                          .filter((c) => c.parent_id === selected.id)
                          .map((c) => (
                            <button key={c.id} onClick={() => choose(c.id)}>
                              {c.name}
                            </button>
                          ))}
                      </div>
                    )}
                    {error ? (
                      <div className="empty-state">
                        <Package />
                        <h2>Не удалось загрузить продукты</h2>
                        <p>{error}</p>
                        <Button
                          onClick={() => {
                            setLoading(true);
                            void load();
                          }}
                        >
                          Попробовать ещё раз
                        </Button>
                      </div>
                    ) : loading ? (
                      <div className="product-grid">
                        {Array.from({ length: 8 }, (_, i) => (
                          <div className="product-card skeleton" key={i}>
                            <div />
                            <span />
                            <span />
                            <span />
                          </div>
                        ))}
                      </div>
                    ) : filtered.length ? (
                      <div className="product-grid">
                        {filtered.map((p) => (
                          <article
                            key={p.id}
                            className={
                              "product-card " + (!p.stock ? "unavailable" : "")
                            }
                          >
                            <div className="product-photo">
                              <img
                                src={p.image}
                                alt={p.name}
                                loading="lazy"
                                width="600"
                                height="600"
                              />
                              {p.unit === "kg" && (
                                <span className="weight-label">Весовой</span>
                              )}
                            </div>
                            <div className="product-body">
                              <p className="product-brand">{p.brand}</p>
                              <h3>{p.name}</h3>
                              <p className="product-description">
                                {p.description}
                              </p>
                              <p className="product-details">{p.details}</p>
                              <div className="product-bottom">
                                <div className="price">
                                  <strong>{money(p.price)}</strong>
                                  <span>
                                    / {p.unit === "kg" ? "кг" : "шт."}
                                  </span>
                                </div>
                                <p
                                  className={
                                    "stock " + (!p.stock ? "empty" : "")
                                  }
                                >
                                  {p.stock ? "В наличии" : "Нет в наличии"}
                                </p>
                                {cart[p.id] > 0 ? (
                                  <Quantity
                                    product={p}
                                    q={cart[p.id]}
                                    onChange={(q) => void change(p, q)}
                                    disabled={cartBusy}
                                  />
                                ) : (
                                  <Button
                                    className="add-button"
                                    disabled={!p.stock || cartBusy}
                                    onClick={() => void change(p, 1)}
                                  >
                                    <Plus size={17} />
                                    <span>
                                      {p.stock
                                        ? "Добавить в корзину"
                                        : "Нет в наличии"}
                                    </span>
                                  </Button>
                                )}
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <Search />
                        <h2>
                          {query
                            ? "Ничего не нашлось"
                            : "Здесь пока нет товаров"}
                        </h2>
                        <p>
                          Попробуйте другой запрос или выберите другую
                          категорию.
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setQuery("");
                            setCategory("all");
                            setBrand("all");
                          }}
                        >
                          Показать все продукты
                        </Button>
                      </div>
                    )}
                  </section>
                </div>
              </>
            )}
            {path === "/cart" && (
              <>
                <button className="back-link" onClick={() => navigate("/")}>
                  <ArrowLeft size={18} />В магазин
                </button>
                <div className="page-title">
                  <h1>Корзина</h1>
                  <span className="muted">{count} позиций</span>
                </div>
                {count ? (
                  <div className="checkout-layout">
                    {cartList()}
                    <aside className="summary-card">
                      <h2>Ваш заказ</h2>
                      <div>
                        <span>Товары, {count} позиций</span>
                        <span>{money(total)}</span>
                      </div>
                      <div className="summary-total">
                        <strong>Итого</strong>
                        <strong>{money(total)}</strong>
                      </div>
                      <Button
                        className="primary-button"
                        disabled={loading || cartBusy}
                        onClick={() => navigate("/checkout")}
                      >
                        Оформить заказ <ChevronRight size={18} />
                      </Button>
                      <p>
                        <ShieldCheck size={17} />
                        Безопасное оформление
                      </p>
                      {closed && (
                        <small>Ваш заказ будет обработан с 08:00.</small>
                      )}
                    </aside>
                  </div>
                ) : (
                  <div className="empty-state spacious">
                    <ShoppingBasket />
                    <h2>В корзине пока пусто</h2>
                    <p>Добавьте продукты, которые пора купить.</p>
                    <Button
                      className="primary-button"
                      onClick={() => navigate("/")}
                    >
                      Перейти в каталог
                    </Button>
                  </div>
                )}
              </>
            )}
            {path === "/login" && (
              <section className="auth-card">
                <button
                  className="back-link"
                  onClick={() =>
                    challenge ? setChallenge(null) : navigate("/cart")
                  }
                >
                  <ArrowLeft size={18} />
                  Назад
                </button>
                <div className="auth-icon">
                  <UserRound size={28} />
                </div>
                <h1>{challenge ? "Введите код" : "Войти в ASTRAKHAN"}</h1>
                <Button variant="outline" onClick={() => navigate("/checkout")}>
                  Продолжить без входа
                </Button>
                <p className="muted">
                  {challenge
                    ? `Отправили код в WhatsApp на ${phone}`
                    : "Отправим одноразовый код в ваш WhatsApp"}
                </p>
                {!challenge ? (
                  <form onSubmit={sendCode}>
                    <label>
                      Номер WhatsApp
                      <input
                        type="tel"
                        autoComplete="tel"
                        placeholder="+7 700 123 45 67"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required
                      />
                    </label>
                    <Button
                      className="primary-button"
                      disabled={busy || cooldown > 0}
                    >
                      {busy ? (
                        <LoaderCircle className="spin" />
                      ) : (
                        "Получить код"
                      )}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={verify}>
                    <label className="code-label">
                      Код из WhatsApp
                      <input
                        className="otp-input"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={4}
                        pattern="[0-9]{4}"
                        placeholder="— — — —"
                        value={code}
                        onChange={(e) =>
                          setCode(e.target.value.replace(/\D/g, ""))
                        }
                        autoFocus
                        required
                      />
                    </label>
                    <p className="muted">
                      {expires
                        ? `Код действует ещё ${Math.floor(expires / 60)}:${String(expires % 60).padStart(2, "0")}`
                        : "Код истёк. Запросите новый."}
                    </p>
                    <Button
                      className="primary-button"
                      disabled={busy || code.length !== 4 || !expires}
                    >
                      {busy ? <LoaderCircle className="spin" /> : "Войти"}
                    </Button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy || cooldown > 0}
                      onClick={() => void sendCode()}
                    >
                      {cooldown
                        ? `Отправить повторно через ${cooldown} с`
                        : "Отправить новый код"}
                    </button>
                  </form>
                )}
                {authError && (
                  <p className="error-message" role="alert">
                    {authError}
                  </p>
                )}
                {challenge?.developmentCode && (
                  <div className="test-notice">
                    Локальный WhatsApp: тестовый код{" "}
                    <b>{challenge.developmentCode}</b>
                  </div>
                )}
                <p className="auth-foot">
                  <ShieldCheck size={16} />
                  Без пароля. Ваш номер останется в безопасности.
                </p>
              </section>
            )}
            {path === "/checkout" && (
              <>
                <button className="back-link" onClick={() => navigate("/cart")}>
                  <ArrowLeft size={18} />В корзину
                </button>
                <h1>Проверка заказа</h1>
                {!count ? (
                  <div className="empty-state">
                    <ShoppingBasket />
                    <h2>Добавьте товары в корзину</h2>
                    <Button onClick={() => navigate("/")}>В каталог</Button>
                  </div>
                ) : (
                  <form className="checkout-layout" onSubmit={pay}>
                    <section>
                      <div className="panel">
                        <h2>Контактные данные</h2>
                        {user?.name && !user.guest ? (
                          <>
                            <strong>{user.name}</strong>
                            <p>{user.phone}</p>
                            {user.contact && <p>{user.contact}</p>}
                          </>
                        ) : (
                          <>
                            <label>
                              Ваше имя
                              <input
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder="Как к вам обращаться"
                                autoComplete="name"
                                minLength={3}
                                required
                              />
                            </label>
                            {(!user || user.guest) && (
                              <label>
                                Телефон для связи
                                <input
                                  type="tel"
                                  autoComplete="tel"
                                  value={phone}
                                  onChange={(e) => setPhone(e.target.value)}
                                  placeholder="+7 XXX XXX XX XX"
                                  maxLength={30}
                                  required
                                />
                              </label>
                            )}
                            <label>
                              Дополнительный номер{" "}
                              <span className="muted">· необязательно</span>
                              <input
                                type="tel"
                                value={contact}
                                onChange={(e) => setContact(e.target.value)}
                                placeholder="+7"
                              />
                            </label>
                            {user && !user.guest && (
                              <p className="muted">WhatsApp: {user.phone}</p>
                            )}
                          </>
                        )}
                        {(!user || user.guest) && (
                          <p className="muted">
                            Вход не требуется. Заказ будет доступен в этом
                            браузере 14 дней, пока вы не выйдете или не очистите
                            данные сайта.
                          </p>
                        )}
                      </div>
                      <div className="panel">
                        <h2>Состав заказа</h2>
                        {cartList(true)}
                      </div>
                    </section>
                    <aside className="summary-card">
                      <h2>Оплата</h2>
                      <div className="payment-options">
                        <button
                          type="button"
                          className={method === "kaspi" ? "chosen" : ""}
                          onClick={() => setMethod("kaspi")}
                        >
                          <b className="kaspi">K</b>Kaspi
                          {method === "kaspi" && <Check size={17} />}
                        </button>
                        <button
                          type="button"
                          className={method === "card" ? "chosen" : ""}
                          onClick={() => setMethod("card")}
                        >
                          <ShieldCheck size={22} />
                          Банковская карта
                          {method === "card" && <Check size={17} />}
                        </button>
                      </div>
                      {mock && (
                        <div className="test-notice">
                          <b>Тестовая оплата</b>
                          <p>Деньги не списываются.</p>
                          <Picker
                            value={testResult}
                            onChange={setTestResult}
                            label="Результат тестовой оплаты"
                            items={[
                              { value: "success", label: "Успешная оплата" },
                              {
                                value: "failure",
                                label: "Проверить отказ банка",
                              },
                            ]}
                          />
                        </div>
                      )}
                      <div className="summary-total">
                        <strong>Итого</strong>
                        <strong>{money(total)}</strong>
                      </div>
                      {paymentError && (
                        <p role="alert" className="error-message">
                          {paymentError}
                        </p>
                      )}
                      <Button
                        className="primary-button"
                        disabled={busy || cartBusy || offline}
                      >
                        {busy ? (
                          <LoaderCircle className="spin" />
                        ) : (
                          "Оплатить " + money(total)
                        )}
                      </Button>
                      {closed && (
                        <small>
                          Магазин сейчас закрыт. Ваш заказ будет обработан с
                          08:00.
                        </small>
                      )}
                      <p className="muted">
                        Когда заказ будет готов, вы сможете забрать его сами или
                        самостоятельно вызвать курьера.
                      </p>
                    </aside>
                  </form>
                )}
              </>
            )}
            {path === "/account" && (
              <section className="account-card">
                <div className="auth-icon">
                  <UserRound />
                </div>
                <h1>{user?.name || "Личный кабинет"}</h1>
                <p className="muted">{user?.phone}</p>
                {user?.guest && (
                  <p className="muted">
                    Вы оформляете заказы как гость. Здесь доступны только заказы
                    из этого браузера.
                  </p>
                )}
                {user ? (
                  <>
                    <button
                      className="account-row"
                      onClick={() => navigate("/orders")}
                    >
                      <Package />
                      <span>Мои заказы</span>
                      <ChevronRight />
                    </button>
                    <button
                      className="account-row"
                      onClick={() => void logout()}
                    >
                      <LogOut />
                      <span>Выйти из аккаунта</span>
                    </button>
                  </>
                ) : (
                  <Button onClick={() => navigate("/login")}>
                    Войти через WhatsApp
                  </Button>
                )}
              </section>
            )}
            {path === "/orders" && (
              <>
                <button
                  className="back-link"
                  onClick={() => navigate("/account")}
                >
                  <ArrowLeft size={18} />
                  Личный кабинет
                </button>
                <h1>Мои заказы</h1>
                {!user ? (
                  <div className="empty-state">
                    <UserRound />
                    <h2>Войдите в аккаунт</h2>
                    <Button onClick={() => navigate("/login")}>Войти</Button>
                  </div>
                ) : orderLoading ? (
                  <div className="loading-block">
                    <LoaderCircle className="spin" />
                    Загружаем заказы…
                  </div>
                ) : orders.length ? (
                  <div className="order-list">
                    {orders.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => navigate("/orders/" + o.id)}
                      >
                        <div>
                          <strong>Заказ №{o.number}</strong>
                          <p>
                            {new Date(o.created_at * 1000).toLocaleString(
                              "ru-RU",
                              { timeZone: "Asia/Almaty" },
                            )}
                          </p>
                        </div>
                        <span className={"status-pill " + o.status}>
                          {statuses[o.status]}
                        </span>
                        <strong>{money(o.total)}</strong>
                        <ChevronRight size={20} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Package />
                    <h2>Здесь появятся ваши заказы</h2>
                    <p>Самое время собрать первую корзину.</p>
                    <Button onClick={() => navigate("/")}>В магазин</Button>
                  </div>
                )}
              </>
            )}
            {path.startsWith("/orders/") && (
              <>
                {orderLoading ? (
                  <div className="loading-block">
                    <LoaderCircle className="spin" />
                    Загружаем заказ…
                  </div>
                ) : order ? (
                  <section className="order-detail">
                    <div className="success-icon">
                      <Check size={32} />
                    </div>
                    <h1>Заказ №{order.number} принят</h1>
                    <p className="muted">
                      {new Date(order.created_at * 1000).toLocaleString(
                        "ru-RU",
                        { timeZone: "Asia/Almaty" },
                      )}
                    </p>
                    <span className={"status-pill " + order.status}>
                      {statuses[order.status]}
                    </span>
                    <div className="order-progress">
                      {["paid", "assembling", "ready", "received"].map(
                        (s, i) => (
                          <div
                            key={s}
                            className={
                              order.status !== "cancelled" &&
                              i <=
                                [
                                  "paid",
                                  "assembling",
                                  "ready",
                                  "received",
                                ].indexOf(order.status)
                                ? "done"
                                : ""
                            }
                          >
                            <span>{i + 1}</span>
                            <small>{statuses[s]}</small>
                          </div>
                        ),
                      )}
                    </div>
                    <div className="panel">
                      {order.items.map((i: any) => (
                        <div className="receipt-row" key={i.id}>
                          <img src={i.image} alt={i.name} />
                          <div>
                            <strong>{i.name}</strong>
                            <p>
                              {quantityLabel(i.quantity, i.unit)} ×{" "}
                              {money(i.price)} /{" "}
                              {i.unit === "kg" ? "кг" : "шт."}
                            </p>
                          </div>
                          <b>{money(i.total)}</b>
                        </div>
                      ))}
                      <div className="summary-total">
                        <b>Итого</b>
                        <b>{money(order.total)}</b>
                      </div>
                      {order.total !== order.paid_total && (
                        <p className="test-notice">
                          Оплачено: {money(order.paid_total)}. Разницу{" "}
                          {money(Math.abs(order.total - order.paid_total))}{" "}
                          сотрудник согласует с вами отдельно.
                        </p>
                      )}
                    </div>
                    {order.reason && (
                      <p className="test-notice">
                        Причина отмены: {order.reason}. Возврат оплаты
                        согласуйте с магазином.
                      </p>
                    )}
                    <p className="muted">
                      Для изменения или отмены заказа свяжитесь с магазином.
                      {shopPhone && (
                        <a className="call-store" href={"tel:" + shopPhone}>
                          Позвонить:{" "}
                          {shopPhone.replace(
                            /(\+7)(\d{3})(\d{3})(\d{2})(\d{2})/,
                            "$1 $2 $3 $4 $5",
                          )}
                        </a>
                      )}
                    </p>
                    {order.history.length > 1 && (
                      <details>
                        <summary>История заказа</summary>
                        {order.history.map((h: any, i: number) => (
                          <p key={i}>
                            {statuses[h.status]} ·{" "}
                            {new Date(h.created_at * 1000).toLocaleString(
                              "ru-RU",
                            )}{" "}
                            {h.note}
                          </p>
                        ))}
                      </details>
                    )}
                    <Button
                      className="primary-button"
                      onClick={() => navigate("/")}
                    >
                      Вернуться в магазин
                    </Button>
                  </section>
                ) : (
                  <p className="error-message">{error || "Заказ не найден"}</p>
                )}
              </>
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <span className="wordmark">ASTRAKHAN</span>
        <p>Продукты на каждый день</p>
        <span>Ежедневно 08:00–22:00</span>
        {shopPhone && (
          <a href={"tel:" + shopPhone}>
            {shopPhone.replace(
              /(\+7)(\d{3})(\d{3})(\d{2})(\d{2})/,
              "$1 $2 $3 $4 $5",
            )}
          </a>
        )}
        <button onClick={() => navigate("/admin")}>Для сотрудников</button>
      </footer>
      <nav className="mobile-nav" aria-label="Основная навигация">
        <button
          className={path === "/" ? "active" : ""}
          onClick={() => navigate("/")}
        >
          <Grid2X2 size={21} />
          <span>Каталог</span>
        </button>
        <button onClick={() => setDrawer(true)}>
          <Menu size={22} />
          <span>Категории</span>
        </button>
        <button
          className={path === "/cart" ? "active" : ""}
          onClick={() => navigate("/cart")}
        >
          <ShoppingBasket size={22} />
          <span>Корзина{count ? " · " + count : ""}</span>
        </button>
        <button
          className={
            path.startsWith("/account") || path.startsWith("/orders")
              ? "active"
              : ""
          }
          onClick={() => navigate(user ? "/account" : "/login")}
        >
          <UserRound size={21} />
          <span>Профиль</span>
        </button>
      </nav>
    </>
  );
}

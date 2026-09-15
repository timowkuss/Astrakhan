import { env } from "cloudflare:workers";
import { first, stmt, database, uid, now, assert, ApiError } from "./db";
export const settings = () => env as unknown as Record<string, string>;
export const isMock = () => settings().APP_MODE === "development";
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function secretHash(value: string) {
  const secret = settings().AUTH_SECRET;
  assert(secret && secret.length >= 32, "Сервис входа не настроен", 503);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function equal(a: string, b: string) {
  let result = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return result === 0;
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  const time = now();
  const row = await stmt(
    "INSERT INTO rate_limits (key,count,reset) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset<=? THEN 1 ELSE count+1 END, reset=CASE WHEN reset<=? THEN excluded.reset ELSE reset END RETURNING count",
    key,
    time + seconds,
    time,
    time,
  ).first<{ count: number }>();
  assert(
    row && row.count <= limit,
    "Слишком много запросов. Попробуйте позже.",
    429,
  );
}
export function guardOrigin(req: Request) {
  if (["GET", "HEAD"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const expected = settings().APP_ORIGIN || new URL(req.url).origin;
  assert(
    !origin || origin === expected,
    "Запрос с другого сайта запрещён",
    403,
  );
  assert(
    req.headers.get("sec-fetch-site") !== "cross-site",
    "Запрос с другого сайта запрещён",
    403,
  );
  assert(
    req.headers.get("content-type")?.startsWith("application/json") ||
      req.headers.get("content-type")?.startsWith("multipart/form-data"),
    "Неверный формат запроса",
    415,
  );
}
export function phoneNumber(s: string) {
  const digits = s.replace(/\D/g, "");
  const value = digits.startsWith("8") ? "7" + digits.slice(1) : digits;
  assert(/^7\d{10}$/.test(value), "Введите номер в формате +7 XXX XXX XX XX");
  return "+" + value;
}
export async function identity(req: Request) {
  const token = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)astra_session=([^;]+)/)?.[1];
  if (!token) return null;
  return first(
    "SELECT s.*,COALESCE(u.guest_phone,u.phone) AS phone,u.guest,p.name,p.contact,a.login FROM sessions s LEFT JOIN users u ON u.id=s.user_id LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires>?",
    await hash(token),
    now(),
  );
}
export async function requireUser(req: Request) {
  const session = await identity(req);
  assert(session?.user_id, "Войдите в аккаунт", 401);
  return session;
}
export async function requireAdmin(req: Request) {
  const session = await identity(req);
  assert(session?.admin_id, "Требуется вход администратора", 403);
  return session;
}
export async function sessionCookie(
  req: Request,
  userId: string | null,
  adminId: string | null,
) {
  const token = uid() + uid();
  await stmt(
    "INSERT INTO sessions(token_hash,user_id,admin_id,expires) VALUES (?,?,?,?)",
    await hash(token),
    userId,
    adminId,
    now() + 86400 * 14,
  ).run();
  return `astra_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${86400 * 14}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}

import { env } from "cloudflare:workers";
export function database() {
  if (!env.DB) throw new Error("Database binding unavailable");
  return env.DB;
}
export function stmt(sql: string, ...args: unknown[]) {
  return database()
    .prepare(sql)
    .bind(...args);
}
export async function first<T = any>(
  sql: string,
  ...args: unknown[]
): Promise<T | null> {
  return stmt(sql, ...args).first<T>();
}
export async function rows<T = any>(
  sql: string,
  ...args: unknown[]
): Promise<T[]> {
  return (await stmt(sql, ...args).all<T>()).results;
}
export async function run(sql: string, ...args: unknown[]) {
  return stmt(sql, ...args).run();
}
export const uid = () => crypto.randomUUID();
export const now = () => Math.floor(Date.now() / 1000);
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new ApiError(status, message);
}

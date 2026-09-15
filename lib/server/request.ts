import { assert, ApiError } from "./db";
export async function boundedBody(req: Request, maxBytes: number) {
  assert(
    Number(req.headers.get("content-length") || 0) <= maxBytes,
    "Слишком большой запрос",
    413,
  );
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader(),
    parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "Слишком большой запрос");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
export async function jsonBody(req: Request) {
  const bytes = await boundedBody(req, 100_000);
  try {
    return bytes.length ? JSON.parse(new TextDecoder().decode(bytes)) : {};
  } catch {
    throw new ApiError(400, "Неверный формат данных");
  }
}

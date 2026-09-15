export async function api(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<any> {
  const payload = body ?? (!["GET", "HEAD"].includes(method) ? {} : undefined);
  let response: Response;
  try {
    response = await fetch("/api/" + path, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
  } catch {
    throw new Error(
      "Нет соединения с магазином. Проверьте интернет и повторите попытку.",
    );
  }
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error("Сервис временно недоступен. Попробуйте ещё раз.");
  }
  if (!response.ok)
    throw new Error(data.error || "Не удалось выполнить запрос");
  return data;
}

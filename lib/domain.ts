export type Product = {
  id: string;
  name: string;
  brand: string;
  brand_id: string;
  description: string;
  details: string;
  price: number;
  unit: "piece" | "kg";
  stock: number;
  category_id: string;
  image: string;
};
export type Category = {
  id: string;
  name: string;
  parent_id: string | null;
  position: number;
  icon: string;
};
export type Cart = Record<string, number>;
export const normalize = (s: string) =>
  s
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/,/g, ".")
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .trim();
export function matchesSearch(text: string, query: string) {
  const source = normalize(text);
  return normalize(query)
    .split(/\s+/)
    .every((token) => source.includes(token));
}
export const money = (value: number) =>
  new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 2 }).format(value) +
  " ₸";
export const quantityLabel = (q: number, unit: string) =>
  new Intl.NumberFormat("ru").format(unit === "kg" ? q / 2 : q) +
  (unit === "kg" ? " кг" : " шт.");
export const lineTotal = (price: number, q: number, unit: string) =>
  Math.round((Math.round(price * 100) * q) / (unit === "kg" ? 2 : 1)) / 100;
export const statuses: Record<string, string> = {
  paid: "Оплачен",
  assembling: "Собирается",
  ready: "Готов",
  received: "Получен",
  cancelled: "Отменён",
};
export function canTransition(from: string, to: string) {
  return (
    (
      {
        paid: ["assembling", "cancelled"],
        assembling: ["ready", "cancelled"],
        ready: ["received", "cancelled"],
        received: [],
        cancelled: [],
      } as Record<string, string[]>
    )[from]?.includes(to) ?? false
  );
}

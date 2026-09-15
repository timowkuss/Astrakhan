import Storefront from "../storefront";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  const valid =
    (path.length === 1 &&
      ["cart", "login", "checkout", "account", "orders", "admin"].includes(
        path[0],
      )) ||
    (path.length === 2 && path[0] === "orders");
  if (!valid) notFound();
  return <Storefront />;
}

import Link from "next/link";
export default function NotFound() {
  return (
    <main className="main">
      <section className="empty-state">
        <h1>Страница не найдена</h1>
        <p>Возможно, ссылка устарела.</p>
        <Link href="/" className="text-button">
          Вернуться в магазин
        </Link>
      </section>
    </main>
  );
}

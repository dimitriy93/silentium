/**
 * Скелетон загрузки Истории (и страницы дня). Страница собирает данные
 * из семи таблиц за одну транзакцию — на медленном канале это заметное
 * время, skeleton даёт мгновенный отклик вместо пустого экрана.
 */
export default function HistoryLoading() {
  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-5 px-5 pt-[max(env(safe-area-inset-top),40px)]">
        <header className="space-y-1 px-1">
          <h1 className="font-chronicle text-[28px] font-bold text-[var(--gold)]">История</h1>
          <p className="text-sm text-[var(--ink-secondary)]">Читаю хронику…</p>
        </header>
        <div className="bronze-card divide-y divide-[var(--card-edge)]" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="space-y-1.5">
                <div className="h-4 w-40 animate-pulse rounded bg-[var(--card-edge)]" />
                <div className="h-3 w-24 animate-pulse rounded bg-[var(--card-edge)]" />
              </div>
              <div className="h-4 w-14 animate-pulse rounded bg-[var(--card-edge)]" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

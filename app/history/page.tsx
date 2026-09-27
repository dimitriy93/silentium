import { Suspense } from "react";
import Link from "next/link";
import BottomNav from "@/components/bottom-nav";
import HistoryClient from "@/components/history-client";

/**
 * Статическая оболочка экрана: список дней собирает клиентский HistoryClient
 * из локального кеша (IndexedDB), Suspense
 * удержан: HistoryClient использует useSearchParams, статическому рендеру
 * нужна граница. Данных на сервере нет — fallback пустой.
 */
export default function HistoryPage() {
  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-5 px-5 pt-[max(env(safe-area-inset-top),40px)]">
        <header className="space-y-1 px-1">
          <h1 className="font-chronicle text-[28px] font-bold text-[var(--gold)]">История</h1>
          <p className="text-sm text-[var(--ink-secondary)]">Хроника прошедших дней.</p>
        </header>

        <div className="flex justify-end px-1">
          <Link href="/chronicle" className="text-xs text-[var(--ink-secondary)] active:text-[var(--gold)]">
            Хроника Пути →
          </Link>
        </div>

        <Suspense fallback={null}>
          <HistoryClient />
        </Suspense>
      </div>
      <BottomNav />
    </main>
  );
}

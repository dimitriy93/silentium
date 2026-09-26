import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import BottomNav from "@/components/bottom-nav";
import HistoryClient from "@/components/history-client";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * История: список дней с активностью, новые сверху. Данные экрана собирает
 * клиентский HistoryClient — мгновенно из локального кеша (IndexedDB), при
 * пустом кеше — серверным экшеном fetchHistoryPage (пагинация ?page=N).
 */
export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

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

        <Suspense fallback={<OrbitalLoaderFallback />}>
          <HistoryClient />
        </Suspense>
      </div>
      <BottomNav />
    </main>
  );
}

function OrbitalLoaderFallback() {
  return (
    <p className="py-8 text-center text-sm text-[var(--ink-faint)]">Читаю хронику…</p>
  );
}

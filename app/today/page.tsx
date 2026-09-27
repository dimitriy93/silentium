import Link from "next/link";
import BottomNav from "@/components/bottom-nav";
import TodayClient from "@/components/today-client";

/**
 * Статическая оболочка экрана: данные читает TodayClient из локальной базы
 * (IndexedDB), доступ проверяет middleware. Рендер не зависит от сети —
 * переход мгновенный и работает офлайн (Local First).
 */
export default function TodayPage() {
  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] px-5 pt-[max(env(safe-area-inset-top),24px)]">
        <div className="flex justify-end pt-1">
          <Link
            href="/settings"
            className="text-xs text-[var(--ink-faint)] active:text-[var(--gold)]"
          >
            Профиль
          </Link>
        </div>
        <TodayClient />
      </div>
      <BottomNav />
    </main>
  );
}

import Link from "next/link";
import BottomNav from "@/components/bottom-nav";
import MentorClient from "@/components/mentor-client";

/**
 * Статическая оболочка экрана: разбор дня выполняет MentorClient через
 * серверный экшен по явной команде пользователя (браузер не знает ключ
 * Gemini), доступ проверяет middleware.
 */
export default function MentorPage() {
  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-5 px-5 pt-[max(env(safe-area-inset-top),40px)]">
        <header className="space-y-1 px-1">
          <Link href="/today" className="text-xs text-[var(--ink-secondary)]">
            ← Сегодня
          </Link>
          <h1 className="font-chronicle text-[28px] font-bold text-[var(--gold)]">Наставник</h1>
        </header>

        <MentorClient />
      </div>
      <BottomNav />
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import BottomNav from "@/components/bottom-nav";
import MentorClient from "@/components/mentor-client";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Наставник — разбор завершённого дня. Записи дня собираются и
 * анализируются серверно (actions/mentor.ts); клиент получает только
 * готовый текст. Браузер не знает ключ Gemini.
 */
export default async function MentorPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

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

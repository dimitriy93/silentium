import Link from "next/link";
import { redirect } from "next/navigation";
import BottomNav from "@/components/bottom-nav";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Наставник — подготовленный интерфейс. Интеграция AI будет добавлена в
 * следующем этапе: сбор записей дня → выжимка (ai_daily_memories) →
 * наставление (mentor_messages). Кнопка пока не выполняет запросов.
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

        <section className="bronze-card bronze-edge space-y-3 p-5">
          <p className="text-[15px] leading-relaxed text-[var(--ink-secondary)]">
            Наставник наблюдает за хроникой и говорит только по существу:
            выжимка дня, наблюдение, наставление. Без пустой мотивации.
          </p>
          <div className="engraved-line" />
          <p className="text-sm text-[var(--ink-faint)]">
            Наставление будет доступно после завершения дня. Функция готовится —
            каркас памяти наставника уже встроен в систему.
          </p>
          <Link
            href="/today"
            className="btn-ghost flex h-11 items-center justify-center text-sm"
          >
            Вернуться к дню
          </Link>
        </section>
      </div>
      <BottomNav />
    </main>
  );
}

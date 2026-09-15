import OrbitalLoader from "@/components/orbital-loader";
import BottomNav from "@/components/bottom-nav";

/**
 * Скелет-состояние Хроники Пути: события летописи собираются на сервере,
 * лоадер даёт мгновенный отклик вместо пустого экрана.
 */
export default function ChronicleLoading() {
  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-6 px-5 pt-[max(env(safe-area-inset-top),40px)]">
        <header className="space-y-1 px-1">
          <h1 className="font-chronicle text-[28px] font-bold text-[var(--gold)]">Хроника Пути</h1>
          <p className="text-sm text-[var(--ink-secondary)]">Летопись твоих событий — от первого шага до сегодня.</p>
        </header>
        <OrbitalLoader label="Разворачиваю летопись…" className="py-16" />
      </div>
      <BottomNav />
    </main>
  );
}

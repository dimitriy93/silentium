import OrbitalLoader from "@/components/orbital-loader";
import BottomNav from "@/components/bottom-nav";

/**
 * Страница одного дня истории собирает данные из семи таблиц за одну
 * транзакцию — на медленном канале это заметное время, лоадер даёт
 * мгновенный отклик вместо пустого экрана.
 */
export default function HistoryDayLoading() {
  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-4 px-5 pt-[max(env(safe-area-inset-top),32px)]">
        <header className="space-y-1 px-1">
          <h1 className="font-chronicle text-2xl font-bold text-[var(--gold)]">День хроники</h1>
        </header>
        <OrbitalLoader label="Читаю хронику…" className="py-16" />
      </div>
      <BottomNav />
    </main>
  );
}

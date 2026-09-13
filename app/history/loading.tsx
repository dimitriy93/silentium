import OrbitalLoader from "@/components/orbital-loader";
import BottomNav from "@/components/bottom-nav";

/**
 * Скелет-состояние Истории: список дней читается из базы на сервере,
 * лоадер даёт мгновенный отклик вместо пустого экрана.
 */
export default function HistoryLoading() {
  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-5 px-5 pt-[max(env(safe-area-inset-top),40px)]">
        <header className="space-y-1 px-1">
          <h1 className="font-chronicle text-[28px] font-bold text-[var(--gold)]">История</h1>
          <p className="text-sm text-[var(--ink-secondary)]">Хроника прошедших дней.</p>
        </header>
        <OrbitalLoader label="Читаю хронику…" className="py-16" />
      </div>
      <BottomNav />
    </main>
  );
}

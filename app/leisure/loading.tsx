import OrbitalLoader from "@/components/orbital-loader";
import BottomNav from "@/components/bottom-nav";

export default function LeisureLoading() {
  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-5 px-5 pt-[max(env(safe-area-inset-top),40px)]">
        <header className="space-y-1 px-1">
          <h1 className="font-chronicle text-[28px] font-bold text-[var(--gold)]">
            Развлечения
          </h1>
          <p className="text-sm text-[var(--ink-secondary)]">
            Честная картина дня. Не приговор — просто факты.
          </p>
        </header>
        <OrbitalLoader label="Читаю хронику…" className="py-16" />
      </div>
      <BottomNav />
    </main>
  );
}

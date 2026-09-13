import OrbitalLoader from "@/components/orbital-loader";
import BottomNav from "@/components/bottom-nav";

export default function SettingsLoading() {
  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-5 px-5 pt-[max(env(safe-area-inset-top),40px)]">
        <header className="space-y-1 px-1">
          <h1 className="font-chronicle text-[28px] font-bold text-[var(--gold)]">Профиль</h1>
        </header>
        <OrbitalLoader label="Открываю профиль…" className="py-16" />
      </div>
      <BottomNav />
    </main>
  );
}

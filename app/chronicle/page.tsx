import BottomNav from "@/components/bottom-nav";
import ChronicleClient from "@/components/chronicle-client";

/**
 * Статическая оболочка Хроники Пути: события летописи строит клиентский
 * ChronicleClient из локальной базы (IndexedDB), при пустой базе показывается пустая летопись.
 */
export default function ChroniclePage() {
  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-6 px-5 pt-[max(env(safe-area-inset-top),40px)]">
        <header className="space-y-1 px-1">
          <h1 className="font-chronicle text-[28px] font-bold text-[var(--gold)]">Хроника Пути</h1>
          <p className="text-sm text-[var(--ink-secondary)]">Летопись твоих событий — от первого шага до сегодня.</p>
        </header>

        <ChronicleClient />
      </div>
      <BottomNav />
    </main>
  );
}

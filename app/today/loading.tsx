import OrbitalLoader from "@/components/orbital-loader";
import BottomNav from "@/components/bottom-nav";

export default function TodayLoading() {
  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] px-5 pt-[max(env(safe-area-inset-top),40px)]">
        <OrbitalLoader label="Открываю день…" className="py-32" />
      </div>
      <BottomNav />
    </main>
  );
}

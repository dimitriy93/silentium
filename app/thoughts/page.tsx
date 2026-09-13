import { redirect } from "next/navigation";
import BottomNav from "@/components/bottom-nav";
import ThoughtsClient from "@/components/thoughts-client";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ThoughtsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-5 px-5 pt-[max(env(safe-area-inset-top),40px)]">
        <header className="space-y-1 px-1">
          <h1 className="font-chronicle text-[28px] font-bold text-[var(--gold)]">Мысли</h1>
          <p className="text-sm text-[var(--ink-secondary)]">
            Личная хроника. Без цензуры, без свидетелей.
          </p>
        </header>
        <ThoughtsClient />
      </div>
      <BottomNav />
    </main>
  );
}

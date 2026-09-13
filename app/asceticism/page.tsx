import { redirect } from "next/navigation";
import AsceticismClient from "@/components/asceticism-client";
import BottomNav from "@/components/bottom-nav";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AsceticismPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-5 px-5 pt-[max(env(safe-area-inset-top),40px)]">
        <header className="space-y-1 px-1">
          <h1 className="font-chronicle text-[28px] font-bold text-[var(--gold)]">Аскезы</h1>
          <p className="text-sm text-[var(--ink-secondary)]">
            Рамки, которые ты выбрал сам. Отметка за день — просто факт.
          </p>
        </header>
        <AsceticismClient />
      </div>
      <BottomNav />
    </main>
  );
}

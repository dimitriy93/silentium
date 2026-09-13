import Link from "next/link";
import { redirect } from "next/navigation";
import BottomNav from "@/components/bottom-nav";
import TodayClient from "@/components/today-client";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] px-5 pt-[max(env(safe-area-inset-top),24px)]">
        <div className="flex justify-end pt-1">
          <Link
            href="/settings"
            className="text-xs text-[var(--ink-faint)] active:text-[var(--gold)]"
          >
            Профиль
          </Link>
        </div>
        <TodayClient />
      </div>
      <BottomNav />
    </main>
  );
}

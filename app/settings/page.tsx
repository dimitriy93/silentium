import Link from "next/link";
import { redirect } from "next/navigation";
import BottomNav from "@/components/bottom-nav";
import SignOutButton from "@/components/sign-out-button";
import StorageSection from "@/components/storage-section";
import SyncSection from "@/components/sync-section";
import XpProfileSection from "@/components/xp-profile-section";
import { formatDateRu } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Профиль: аккаунт, локальный опыт и уровень (сервер не запрашивается —
 * всё из IndexedDB), ручная синхронизация и выход.
 */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-5 px-5 pt-[max(env(safe-area-inset-top),40px)]">
        <header className="space-y-1 px-1">
          <Link href="/today" className="text-xs text-[var(--ink-secondary)]">
            ← Сегодня
          </Link>
          <h1 className="font-chronicle text-[28px] font-bold text-[var(--gold)]">Профиль</h1>
        </header>

        <section className="bronze-card bronze-edge space-y-2 p-4 text-[15px]">
          <p className="text-[var(--ink-secondary)]">
            {user.email ?? "Дневник"}
          </p>
          <p className="text-xs text-[var(--ink-faint)]">
            В хронике с{" "}
            {user.created_at ? formatDateRu(isoDate(user.created_at)) : "—"}
          </p>
        </section>

        <XpProfileSection />

        <SyncSection />

        <StorageSection />

        <SignOutButton />
      </div>
      <BottomNav />
    </main>
  );
}

function isoDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

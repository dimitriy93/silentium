import Link from "next/link";
import BottomNav from "@/components/bottom-nav";
import BackupSection from "@/components/backup-section";
import CloudSyncSection from "@/components/cloud-sync-section";
import StorageSection from "@/components/storage-section";
import AboutSection from "@/components/about-section";
import XpProfileSection from "@/components/xp-profile-section";
import PathStatsSection from "@/components/path-stats-section";

/**
 * Профиль: локальный опыт и уровень (IndexedDB), статистика пути,
 * информация о хранилище и резервная копия. Статическая страница: данных
 * пользователя на сервере нет — всё читают клиентские блоки из локальной базы.
 */
export default function SettingsPage() {
  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-5 px-5 pt-[max(env(safe-area-inset-top),40px)]">
        <header className="space-y-1 px-1">
          <Link href="/today" className="text-xs text-[var(--ink-secondary)]">
            ← Сегодня
          </Link>
          <h1 className="font-chronicle text-[28px] font-bold text-[var(--gold)]">Профиль</h1>
        </header>

        <XpProfileSection />

        <PathStatsSection />

        <BackupSection />

        <CloudSyncSection />

        <StorageSection />

        <AboutSection />
      </div>
      <BottomNav />
    </main>
  );
}

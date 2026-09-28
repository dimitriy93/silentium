import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Общий каркас публичных юридических страниц (/privacy, /terms).
 * Статическая страница без авторизации: должна открываться без входа в
 * приложение и оставаться читаемой в офлайн-кеше service worker'а после
 * первого посещения. Внутренние ссылки Next получают basePath автоматически.
 */
export default function LegalPage({
  title,
  backHref = "/",
  backLabel = "← На главную",
  children,
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
}) {
  return (
    <main className="pb-24">
      <div className="mx-auto w-full max-w-[720px] px-5 pt-[max(env(safe-area-inset-top),40px)]">
        <header className="space-y-1 px-1">
          <Link href={backHref} className="text-xs text-[var(--ink-secondary)]">
            {backLabel}
          </Link>
          <h1 className="font-chronicle text-[clamp(22px,7vw,26px)] font-bold leading-tight text-[var(--gold)] [overflow-wrap:anywhere] [hyphens:auto]">
            {title}
          </h1>
        </header>

        <div className="prose-legal mt-4 min-w-0 space-y-3 px-1 text-[15px] leading-relaxed [overflow-wrap:break-word] [hyphens:auto] text-[var(--ink)] [&_a]:text-[var(--bronze-bright)] [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-[var(--gold)] [&_h2]:font-chronicle [&_h2]:mt-7 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-[var(--gold)] [&_code]:rounded [&_code]:bg-[var(--input)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:text-[var(--bronze-bright)] [&_li]:pl-1 [&_p]:text-justify [&_strong]:text-[var(--ink)] [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </div>
      </div>
    </main>
  );
}

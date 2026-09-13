"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const items = [
  { href: "/today", label: "Сегодня", icon: SunIcon },
  { href: "/path", label: "Путь", icon: FlameIcon },
  { href: "/thoughts", label: "Мысли", icon: QuillIcon },
  { href: "/asceticism", label: "Аскезы", icon: ShieldIcon },
  { href: "/history", label: "История", icon: ScrollIcon },
] as const;

/**
 * Нижняя навигация: фиксированная плашка с учётом safe-area.
 * Пять основных разделов; «Развлечения» и «Настройки» доступны
 * с экрана «Сегодня».
 *
 * Мгновенная реакция: нажатая вкладка подсвечивается сразу (pendingHref),
 * не дожидаясь серверного рендера новой страницы; когда pathname
 * меняется — подсветка переходит к активному разделу.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-5 pb-[max(env(safe-area-inset-bottom),14px)]"
    >
      <div className="stone-nav flex w-full max-w-[440px] items-stretch gap-0.5 rounded-2xl p-1.5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          const highlighted = active || pendingHref === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={() => setPendingHref(href)}
              className={
                "flex min-w-[60px] flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors " +
                (highlighted
                  ? "bg-[var(--pill-active)] text-[var(--gold)]"
                  : "text-[var(--ink-secondary)] active:text-[var(--ink)]") +
                (pendingHref === href && !active ? " animate-pulse" : "")
              }
            >
              <Icon active={highlighted} />
              <span className="text-[10px] leading-none font-semibold">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

type IconProps = { active: boolean };

function SunIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FlameIcon({ active }: IconProps) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3c3 3.2 6 5.8 6 10a6 6 0 1 1-12 0c0-2.2.9-4 2.2-5.6.5 1.2 1.3 2 2.3 2.4C10.4 7.6 11 5.4 12 3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill={active ? "rgba(201,168,106,0.18)" : "none"}
      />
    </svg>
  );
}

function QuillIcon({ active }: IconProps) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 19C5 10 11 5 20 4c1 9-4 15-13 15"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill={active ? "rgba(201,168,106,0.18)" : "none"}
      />
      <path d="M4 20c3-5.5 7.5-9.5 12-12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon({ active }: IconProps) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3 5 6v5c0 4.6 3 8.4 7 10 4-1.6 7-5.4 7-10V6l-7-3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill={active ? "rgba(201,168,106,0.18)" : "none"}
      />
    </svg>
  );
}

function ScrollIcon({ active }: IconProps) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill={active ? "rgba(201,168,106,0.18)" : "none"}
      />
      <path d="M6 4a2 2 0 0 0-2 2v1h2M9 9h6M9 13h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

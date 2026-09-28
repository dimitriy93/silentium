"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const leftItems = [
  { href: "/today", label: "Сегодня", icon: SunIcon },
  { href: "/path", label: "Путь", icon: FlameIcon },
] as const;

const rightItems = [
  { href: "/history", label: "История", icon: ScrollIcon },
  { href: "/settings", label: "Профиль", icon: PersonIcon },
] as const;

const menuItems = [
  { href: "/thoughts", label: "Мысли", icon: QuillIcon },
  { href: "/asceticism", label: "Аскезы", icon: ShieldIcon },
] as const;

/**
 * Нижняя навигация: фиксированная плашка с учётом safe-area.
 * Сегодня · Путь · [+] · История · Профиль; «Мысли» и «Аскезы» — в меню
 * центральной кнопки. «Развлечения» и «Настройки» доступны с экрана «Сегодня».
 *
 * Мгновенная реакция: нажатая вкладка подсвечивается сразу (pendingHref),
 * не дожидаясь серверного рендера новой страницы; когда pathname
 * меняется — подсветка переходит к активному разделу.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const centerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPendingHref(null);
    setMenuOpen(false);
  }, [pathname]);

  // Клик мимо меню (в том числе по другим вкладкам) закрывает его,
  // не мешая самому переходу.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (centerRef.current && !centerRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // Мысли и Аскезы открываются через центральное меню — подсвечиваем
  // кнопку, когда пользователь находится в одном из этих разделов.
  const centerAccent =
    pathname.startsWith("/thoughts") || pathname.startsWith("/asceticism");

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-5 pb-[max(env(safe-area-inset-bottom),14px)]"
    >
      <div className="stone-nav flex w-full max-w-[440px] items-center gap-0.5 rounded-2xl p-1.5">
        {leftItems.map(({ href, label, icon: Icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={Icon}
            active={pathname === href || pathname.startsWith(href + "/")}
            pending={pendingHref === href}
            onNavigate={() => setPendingHref(href)}
          />
        ))}

        <div ref={centerRef} className="relative flex flex-1 justify-center">
          {menuOpen && (
            <div className="absolute bottom-full left-1/2 z-10 mb-2.5 -translate-x-1/2">
              <div
                role="menu"
                aria-label="Добавить запись"
                className="stone-nav nav-menu flex flex-row flex-wrap justify-center gap-3 rounded-2xl p-3"
              >
                {menuItems.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    role="menuitem"
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className={
                      "flex w-[68px] flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors " +
                      (pathname.startsWith(href + "/") || pathname === href
                        ? "bg-[var(--pill-active)] text-[var(--gold)]"
                        : "text-[var(--ink-secondary)] hover:text-[var(--ink)] active:bg-[var(--pill-active)] active:text-[var(--gold)]")
                    }
                  >
                    <span className="flex h-[36px] w-[36px] items-center justify-center rounded-full border border-[#5c4826] bg-[linear-gradient(180deg,#3f3524,#2b2418)] text-[var(--gold)] shadow-[0_4px_10px_rgba(0,0,0,0.35)]">
                      <Icon active={pathname.startsWith(href + "/") || pathname === href} />
                    </span>
                    <span className="text-[10px] leading-none font-semibold">{label}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Закрыть меню" : "Добавить запись"}
            onClick={() => setMenuOpen((open) => !open)}
            className={
              "flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border transition-all duration-200 " +
              (centerAccent || menuOpen
                ? "border-[var(--bronze-bright)] bg-[linear-gradient(180deg,#4a3d27,#2f2718)] text-[var(--gold)] shadow-[0_0_0_1px_rgba(176,141,87,0.25),0_8px_20px_rgba(0,0,0,0.45)]"
                : "border-[#5c4826] bg-[linear-gradient(180deg,#3f3524,#2b2418)] text-[var(--gold)] shadow-[0_6px_16px_rgba(0,0,0,0.4)] active:brightness-115")
            }
          >
            <PlusIcon open={menuOpen} />
          </button>
        </div>

        {rightItems.map(({ href, label, icon: Icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={Icon}
            active={pathname === href || pathname.startsWith(href + "/")}
            pending={pendingHref === href}
            onNavigate={() => setPendingHref(href)}
          />
        ))}
      </div>
    </nav>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  pending,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: (props: IconProps) => React.ReactNode;
  active: boolean;
  pending: boolean;
  onNavigate: () => void;
}) {
  const highlighted = active || pending;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={
        "flex min-w-[48px] flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors " +
        (highlighted
          ? "bg-[var(--pill-active)] text-[var(--gold)]"
          : "text-[var(--ink-secondary)] active:text-[var(--ink)]") +
        (pending && !active ? " animate-pulse" : "")
      }
    >
      <Icon active={highlighted} />
      <span className="text-[10px] leading-none font-semibold">{label}</span>
    </Link>
  );
}

type IconProps = { active: boolean };

function PlusIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={"transition-transform duration-200 " + (open ? "rotate-45" : "")}
    >
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function PersonIcon({ active }: IconProps) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        cx="12"
        cy="8"
        r="3.6"
        stroke="currentColor"
        strokeWidth="1.7"
        fill={active ? "rgba(201,168,106,0.18)" : "none"}
      />
      <path
        d="M5 20c1.2-3.6 3.8-5.4 7-5.4s5.8 1.8 7 5.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

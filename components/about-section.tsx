import Link from "next/link";

/**
 * Блок «О приложении» в нижней части Профиля: публичные юридические
 * документы. Отдельные страницы (а не popup), чтобы Google и пользователи
 * могли открыть их по постоянному URL; ссылки Next получают basePath
 * автоматически (GitHub Pages и локальная разработка работают одинаково).
 */
export default function AboutSection() {
  return (
    <section className="bronze-card bronze-edge p-4">
      <h2 className="font-chronicle mb-3 text-base font-semibold text-[var(--gold)]">
        О приложении
      </h2>
      <ul className="space-y-2 text-sm">
        <li>
          <Link
            href="/privacy"
            className="underline decoration-[var(--card-edge)] underline-offset-4 hover:text-[var(--gold)]"
          >
            Политика конфиденциальности
          </Link>
        </li>
        <li>
          <Link
            href="/terms"
            className="underline decoration-[var(--card-edge)] underline-offset-4 hover:text-[var(--gold)]"
          >
            Условия пользования
          </Link>
        </li>
      </ul>
    </section>
  );
}

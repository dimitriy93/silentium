import { redirect } from "next/navigation";

/**
 * Корневой маршрут: решение принимает middleware по сессии
 * (авторизован → «/today», нет → «/login»). Страница остаётся только
 * как fallback для запросов в обход middleware.
 */
export default function RootPage() {
  redirect("/today");
}

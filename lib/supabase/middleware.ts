import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Авторизация и обновление Supabase-сессии в одном месте (маршруты защищает
 * middleware, страницам собственные проверки не нужны).
 *
 * Local First: клиентская навигация между вкладками (RSC-запросы) получает
 * только статические оболочки экранов — пользовательских данных в них нет,
 * экраны читают IndexedDB на клиенте. Поэтому для RSC-запросов сетевая
 * проверка сессии не выполняется вовсе: достаточно наличия auth-cookie.
 * Переходы между вкладками работают мгновенно и без доступного Supabase.
 *
 * Полная проверка и ротация access token (getUser из refresh token) остаются
 * на загрузках документов (reload, первый вход, переход по ссылке) и в
 * server actions — этих точек достаточно, чтобы сессия не протухала.
 *
 * Сами cookies валидны 30 дней, access token — ~1 час.
 */

/** Маршруты для неавторизованных. */
const GUEST_PATHS = new Set(["/login", "/register"]);

function hasAuthCookies(request: NextRequest): boolean {
  return request.cookies.getAll().some(({ name }) => name.startsWith("sb-"));
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // RSC-запрос клиента: prefetch и переходы по вкладкам (GET + RSC: 1).
  // Server actions сюда не попадают — они POST.
  if (request.method === "GET" && request.headers.get("RSC") === "1") {
    if (GUEST_PATHS.has(pathname)) {
      return hasAuthCookies(request)
        ? NextResponse.redirect(new URL("/today", request.url))
        : NextResponse.next();
    }
    if (!hasAuthCookies(request)) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  // Документ или server action: полная проверка сессии с обновлением токена.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // ВАЖНО: не добавлять логику между createServerClient и getUser().
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    if (!GUEST_PATHS.has(pathname)) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  } else if (GUEST_PATHS.has(pathname) || pathname === "/") {
    // Авторизованного не пускаем на гостевые маршруты; «/» — всегда «Сегодня».
    return NextResponse.redirect(new URL("/today", request.url));
  }

  return supabaseResponse;
}

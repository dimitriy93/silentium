/*
 * Service Worker Silentium (полностью статическое приложение).
 * Стратегии:
 *  - статика Next (_next/static), иконки, ассеты комнаты/аватара, иллюстрации
 *    Пути и трофеи: cache-first (файлы неизменяемы или содержат хеш в имени);
 *  - RSC-payload'ы клиентской навигации Next (статические оболочки экранов,
 *    в экспорте — файлы index.txt): network-first, офлайн — последний
 *    закешированный payload (переходы по вкладкам без сети);
 *  - навигации (HTML): network-first, офлайн — последний закешированный
 *    ответ, затем оболочка /today/;
 *  - остальное: только сеть.
 * Базовый путь деплоя берётся из scope регистрации — SW одинаково работает
 * в корне хостинга и в подпапке (NEXT_PUBLIC_BASE_PATH).
 * Версия кеша: при деплое менять CACHE_VERSION (устаревшие payload'ы другого
 * билда не должны переживать деплой).
 */
const CACHE_VERSION = "silentium-static-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGES_CACHE = `${CACHE_VERSION}-pages`;
const RSC_CACHE = `${CACHE_VERSION}-rsc`;

/* Каталог деплоя: scope всегда заканчивается на «/». */
const BASE = new URL(self.registration.scope, self.location.origin).pathname;

const PRECACHE = [
  `${BASE}icons/icon.png`,
  `${BASE}room/room_morning.webp`,
  `${BASE}room/room_afternoon.webp`,
  `${BASE}room/room_evening.webp`,
  `${BASE}room/room_night.webp`,
];

/*
 * Локальные вкладки (статические оболочки, данные — из IndexedDB).
 * При установке кешируются HTML (офлайн-открытие вкладки) и RSC-payload
 * (index.txt рядом с HTML — офлайн-переходы по вкладкам без сети).
 */
const TABS = [
  "today/",
  "path/",
  "thoughts/",
  "asceticism/",
  "history/",
  "chronicle/",
  "leisure/",
];

/** URL без временного параметра _rsc — ключ RSC-кеша. */
function rscCacheKey(url) {
  const u = new URL(url);
  u.searchParams.delete("_rsc");
  return u.toString();
}

async function cacheTab(path) {
  // HTML оболочки.
  try {
    const page = await fetch(`${BASE}${path}`, { cache: "no-cache" });
    if (page.ok) {
      const cache = await caches.open(PAGES_CACHE);
      await cache.put(`${BASE}${path}`, page.clone());
    }
  } catch {
    // Нет сети при установке — страница закешируется при первом визите.
  }
  // RSC-payload (файл index.txt рядом с HTML). Кладём под два ключа:
  // сам файл (запросы к *.txt) и URL вкладки (RSC-запросы роутера к странице).
  try {
    const payload = await fetch(`${BASE}${path}index.txt`, { cache: "no-cache" });
    if (payload.ok) {
      const cache = await caches.open(RSC_CACHE);
      const headers = new Headers(payload.headers);
      headers.delete("vary");
      const clean = new Response(await payload.clone().body, {
        status: payload.status,
        headers,
      });
      await cache.put(`${BASE}${path}index.txt`, clean.clone());
      await cache.put(new Request(`${BASE}${path}`), clean);
    }
  } catch {
    // Payload закешируется при первом онлайн-переходе.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => Promise.all(TABS.map((p) => cacheTab(p))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(pathname) {
  const p = pathname.startsWith(BASE) ? pathname.slice(BASE.length - 1) : pathname;
  return (
    p.startsWith("/_next/static/") ||
    p.startsWith("/icons/") ||
    p.startsWith("/room/") ||
    p.startsWith("/avatar/") ||
    p.startsWith("/path/") ||
    p.startsWith("/achievements/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Статика: cache-first.
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Клиентская навигация Next (RSC-запросы и прямые запросы index.txt):
  // network-first с офлайн-фолбэком. Ключ кеша — без временного параметра
  // _rsc (он свой у каждой сессии роутера, payload статической оболочки
  // от него не зависит).
  const isRsc =
    request.headers.get("rsc") === "1" || url.pathname.endsWith("index.txt");
  if (isRsc) {
    const cacheKey = rscCacheKey(request.url);
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            // Vary зависит от текущего маршрута и сломал бы офлайн-совпадение
            // из другого маршрута — сохраняем payload без Vary.
            const headers = new Headers(response.headers);
            headers.delete("vary");
            const sanitized = new Response(response.clone().body, {
              status: response.status,
              headers,
            });
            const copy = sanitized.clone();
            caches.open(RSC_CACHE).then((cache) => cache.put(cacheKey, copy));
            return sanitized;
          }
          return response;
        })
        .catch(() =>
          caches
            .match(cacheKey)
            .then((hit) => hit || caches.match(`${cacheKey.replace(/\/$/, "")}/index.txt`))
            .then((hit) => hit || Response.error()),
        ),
    );
    return;
  }

  // Навигации: network-first с офлайн-фолбэком на последний закешированный
  // HTML, затем на оболочку /today/. Ищем строго в PAGES_CACHE:
  // caches.match без имени кеша обошёл бы и RSC_CACHE.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(PAGES_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .open(PAGES_CACHE)
            .then((cache) => cache.match(request))
            .then((hit) => hit || cache.match(`${BASE}today/`))
            .then((hit) => hit || Response.error()),
        ),
    );
  }
});

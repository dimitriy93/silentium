/*
 * Service Worker Silentium.
 * Стратегии:
 *  - навигации (HTML): network-first, офлайн — последний закешированный ответ;
 *  - клиентская навигация Next (RSC-запросы статических оболочек): network-first,
 *    офлайн — последний закешированный payload (переходы по вкладкам без сервера);
 *  - статика Next (_next/static), иконки, ассеты комнаты/аватара, иллюстрации
 *    Пути и трофеи: cache-first (файлы неизменяемы или содержат хеш в имени);
 *  - остальное (server actions, API): только сеть.
 * Версия кеша: при деплое менять CACHE_VERSION (устаревшие RSC-payload'ы
 * другого билда не должны переживать деплой).
 */
const CACHE_VERSION = "silentium-v11";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGES_CACHE = `${CACHE_VERSION}-pages`;
const RSC_CACHE = `${CACHE_VERSION}-rsc`;

const PRECACHE = [
  "/icons/icon.png",
  "/room/room_morning.webp",
  "/room/room_afternoon.webp",
  "/room/room_evening.webp",
  "/room/room_night.webp",
];

/*
 * Локальные вкладки (статические оболочки, данные — из IndexedDB).
 * Их RSC-payload'ы кешируются при установке SW: офлайн-переходы по вкладкам
 * не зависят от того, успел ли Next префетчить ссылку.
 */
const RSC_TABS = [
  "/today",
  "/path",
  "/thoughts",
  "/asceticism",
  "/history",
  "/chronicle",
  "/leisure",
];

async function cacheRscPayload(path) {
  try {
    const res = await fetch(`${path}?_rsc=sw`, { headers: { RSC: "1" } });
    if (!res.ok) return;
    const headers = new Headers(res.headers);
    headers.delete("vary");
    const cache = await caches.open(RSC_CACHE);
    await cache.put(
      new Request(path, { headers: { RSC: "1" } }),
      new Response(res.body, { status: res.status, headers }),
    );
  } catch {
    // Нет сети при установке — payload закешируется при первом визите.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(async () => {
        await Promise.all(RSC_TABS.map((p) => cacheRscPayload(p)));
      })
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

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/room/") ||
    url.pathname.startsWith("/avatar/") ||
    url.pathname.startsWith("/path/") ||
    url.pathname.startsWith("/achievements/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Статика: cache-first.
  if (isStaticAsset(url)) {
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

  // Клиентская навигация Next (RSC): network-first с офлайн-фолбэком.
  // Экранные оболочки статические и не содержат пользовательских данных —
  // закешированный payload даёт рабочие переходы по вкладкам без сервера.
  // Ключ кеша — без временного параметра _rsc (он свой у каждой сессии
  // роутера, payload статической оболочки от него не зависит).
  if (request.headers.get("rsc") === "1") {
    const u = new URL(request.url);
    u.searchParams.delete("_rsc");
    const cacheKey = new Request(u.toString(), { headers: request.headers });
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            // Vary (RSC, Next-Router-State-Tree, …) зависит от текущего
            // маршрута и сломал бы офлайн-совпадение из другого маршрута —
            // сохраняем payload без Vary, матч строго по ключу. Отдельный
            // RSC-кеш: ключ без _rsc совпадает с URL HTML-навигации.
            const headers = new Headers(response.headers);
            headers.delete("vary");
            const body = response.clone().body;
            const sanitized = new Response(body, { status: response.status, headers });
            const copy = sanitized.clone();
            caches.open(RSC_CACHE).then((cache) => cache.put(cacheKey, copy));
            return sanitized;
          }
          return response;
        })
        .catch(() =>
          caches.match(cacheKey).then((hit) => hit || Response.error()),
        ),
    );
    return;
  }

  // Навигации: network-first с офлайн-фолбэком на последний закешированный HTML.
  // Ищем строго в PAGES_CACHE: caches.match без имени кеша обошёл бы и RSC_CACHE
  // и вернул бы flight-данные вместо HTML.
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
            .then((hit) => hit || cache.match("/today"))
            .then((hit) => hit || Response.error()),
        ),
    );
  }
});

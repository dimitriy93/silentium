/*
 * Service Worker Silentium.
 * Стратегии:
 *  - навигации (HTML): network-first, офлайн — последний закешированный ответ;
 *  - статика Next (_next/static), иконки, ассеты комнаты/аватара, иллюстрации
 *    Пути и трофеи: cache-first (файлы неизменяемы или содержат хеш в имени);
 *  - остальное (server actions, API): только сеть.
 * Версия кеша: при деплое менять CACHE_VERSION.
 */
const CACHE_VERSION = "silentium-v4";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGES_CACHE = `${CACHE_VERSION}-pages`;

const PRECACHE = [
  "/icons/icon.png",
  "/room/room_morning.webp",
  "/room/room_afternoon.webp",
  "/room/room_evening.webp",
  "/room/room_night.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
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

  // Навигации: network-first с офлайн-фолбэком на последний закешированный HTML.
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
            .match(request)
            .then((hit) => hit || caches.match("/today"))
            .then((hit) => hit || Response.error()),
        ),
    );
  }
});

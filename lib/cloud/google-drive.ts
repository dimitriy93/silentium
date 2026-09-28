"use client";

import { createBackupJson } from "@/lib/local/backup";

/**
 * Google Drive Cloud Backup: опциональная удалённая копия существующего
 * локального backup. IndexedDB остаётся source of truth — Google используется
 * только как хранилище одного JSON-файла формата silentium-backup.
 *
 * OAuth: Google Identity Services token model (google.accounts.oauth2) —
 * официально рекомендованный Google flow для браузерных приложений без
 * бэкенда. Нужен только Client ID (public client); client secret в этом flow
 * не существует в принципе, redirect URI не используются — авторизация
 * проходит в popup'е Google с проверкой Authorized JavaScript origins.
 *
 * Scope: drive.appdata (non-sensitive) — доступ только к скрытой папке
 * appDataFolder внутри Drive пользователя. Файл невидим в UI Drive,
 * недоступен другим приложениям и не может быть расшарен. Полный scope
 * drive не запрашивается.
 *
 * Токены: браузерный flow выдаёт короткоживущий access token (~час) без
 * refresh token, поэтому токен не хранится — запрашивается заново по
 * действию пользователя. Локально сохраняются только флаг подключения и
 * timestamp последней успешной синхронизации (localStorage).
 *
 * Модуль не изменяет локальные данные: sync выгружает snapshot текущего
 * backup, restore возвращает JSON-строку, которую вызывающий код обязан
 * прогнать через существующий validated import (parseBackupJson →
 * applyBackup).
 */

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

/** Единственный backup-файл Silentium в appDataFolder. */
const BACKUP_FILE_NAME = "silentium-backup.json";

const CONNECTED_KEY = "silentium.cloud.connected";
const LAST_SYNC_KEY = "silentium.cloud.lastSyncAt";

/** Client ID — публичное значение, безопасно встраивается в статику. */
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ?? "";

// ---------- Состояние подключения ----------

export interface CloudConnectionState {
  /** Пользователь ранее подключил Google Drive (согласие выдано). */
  connected: boolean;
  /** Timestamp последней УСПЕШНОЙ синхронизации (ISO), null — ещё не было. */
  lastSyncAt: string | null;
}

/** Настроен ли cloud backup при сборке (NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID). */
export function isDriveConfigured(): boolean {
  return CLIENT_ID.length > 0;
}

/** Состояние подключения из localStorage. Безопасно вызывать на сервере. */
export function getCloudConnectionState(): CloudConnectionState {
  if (typeof window === "undefined") return { connected: false, lastSyncAt: null };
  return {
    connected: window.localStorage.getItem(CONNECTED_KEY) === "1",
    lastSyncAt: window.localStorage.getItem(LAST_SYNC_KEY),
  };
}

/** Забыть подключение: локальные данные Silentium и файл в Drive не трогаем. */
export function disconnectDrive(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CONNECTED_KEY);
  window.localStorage.removeItem(LAST_SYNC_KEY);
  // Токен в памяти не хранится (живёт только внутри запроса), отдельного
  // revoke не требуется — новое согласие потребуется при следующем входе.
}

// ---------- Google Identity Services ----------

interface TokenResponse {
  access_token?: string;
  scope?: string;
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type?: string; message?: string }) => void;
}

interface GoogleOauth2 {
  initTokenClient(config: TokenClientConfig): { requestAccessToken(options?: { prompt?: string }): void };
  hasGrantedAllScopes(tokenResponse: TokenResponse, ...scopes: string[]): boolean;
  revoke(accessToken: string, done?: () => void): void;
}

interface GoogleGlobal {
  accounts?: { oauth2?: GoogleOauth2 };
}

declare global {
  interface Window {
    google?: GoogleGlobal;
  }
}

const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
let gisLoadPromise: Promise<GoogleOauth2> | null = null;

/**
 * Загрузить GIS-скрипт лениво — только когда пользователь сам решил
 * подключить Drive. Приложение без этого скрипта полностью работает
 * (в том числе офлайн).
 */
function loadGoogleOauth2(): Promise<GoogleOauth2> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Drive доступен только в браузере"));
  }
  const ready = window.google?.accounts?.oauth2;
  if (ready) return Promise.resolve(ready);
  if (!gisLoadPromise) {
    gisLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        const lib = window.google?.accounts?.oauth2;
        if (lib) resolve(lib);
        else reject(new Error("Не удалось инициализировать Google авторизацию"));
      };
      script.onerror = () => {
        gisLoadPromise = null;
        reject(new Error("Не удалось загрузить Google авторизацию. Проверьте подключение к интернету"));
      };
      document.head.appendChild(script);
    });
  }
  return gisLoadPromise;
}

/**
 * Запросить access token через popup Google. Вызывается только из обработчика
 * действия пользователя. prompt:"" — повторное согласие не показывается,
 * если пользователь уже выдал доступ этому приложению.
 */
async function requestAccessToken(): Promise<{ token: string; response: TokenResponse }> {
  const oauth2 = await loadGoogleOauth2();
  return new Promise<{ token: string; response: TokenResponse }>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.access_token) {
          resolve({ token: response.access_token, response });
        } else {
          reject(new Error("Google не вернул токен доступа"));
        }
      },
      error_callback: (error) => {
        const popupIssue =
          (error.type ?? "").includes("popup") || /popup/i.test(error.message ?? "");
        reject(
          new Error(
            popupIssue
              ? "Не удалось открыть окно Google. Разрешите всплывающие окна для этого сайта и попробуйте снова"
              : (error.type === "popup_closed" || error.type === "popup_closed_by_user"
                ? "Окно Google было закрыто до выдачи доступа"
                : (error.message ?? "Не удалось получить доступ к Google Drive")),
          ),
        );
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}

/** Получить валидный токен с нужным scope, выбрасывая понятные ошибки. */
async function requireToken(): Promise<{ token: string; oauth2: GoogleOauth2 }> {
  if (!isDriveConfigured()) {
    throw new Error(
      "Cloud backup не настроен в этой сборке: не задан NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID",
    );
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Нет подключения к интернету. Локальные данные в порядке — синхронизация недоступна офлайн");
  }
  const { token, response } = await requestAccessToken();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Не удалось инициализировать Google авторизацию");
  if (!oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
    throw new Error("Google не выдал доступ к области данных приложения. Повторите подключение");
  }
  return { token, oauth2 };
}

// ---------- Drive REST ----------

async function driveFetch(url: string, token: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
  } catch {
    throw new Error("Не удалось связаться с Google Drive. Проверьте подключение к интернету");
  }
  if (response.status === 401) {
    throw new Error("Сессия Google истекла. Повторите синхронизацию");
  }
  return response;
}

interface DriveFile {
  id: string;
  name: string;
}

/** Найти backup-файл в appDataFolder (не более одного, но ищем по имени). */
async function findBackupFile(token: string): Promise<DriveFile | null> {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name='${BACKUP_FILE_NAME}'`,
    fields: "files(id,name)",
    pageSize: "10",
  });
  const response = await driveFetch(`${DRIVE_API}/files?${params.toString()}`, token);
  if (!response.ok) throw new Error(`Google Drive ответил ошибкой (${response.status})`);
  const data = (await response.json()) as { files?: DriveFile[] };
  return data.files?.[0] ?? null;
}

/** Multipart upload: метаданные файла + содержимое backup. */
async function uploadBackup(token: string, json: string, fileId: string | null): Promise<void> {
  const boundary = "silentium-backup-boundary";
  const metadata = {
    name: BACKUP_FILE_NAME,
    parents: ["appDataFolder"],
    mimeType: "application/json",
  };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${json}\r\n` +
    `--${boundary}--`;

  const url = fileId
    ? `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=multipart`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart`;

  const response = await driveFetch(url, token, {
    method: fileId ? "PATCH" : "POST",
    headers: {
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`Не удалось загрузить backup в Google Drive (${response.status})`);
  }
}

// ---------- Публичные операции ----------

/**
 * Синхронизировать локальные данные в Google Drive.
 *
 * Экспортирует свежий backup (createBackupJson проставляет exportedAt),
 * создаёт файл при первой синхронизации и ПЕРЕЗАПИСЫВАЕТ его же при
 * последующих. Timestamp записывается только после успеха; при ошибке
 * локальные данные и метаданные синхронизации остаются прежними.
 */
export async function syncToDrive(): Promise<void> {
  const { token } = await requireToken();

  const json = await createBackupJson();
  const existing = await findBackupFile(token);
  await uploadBackup(token, json, existing?.id ?? null);

  window.localStorage.setItem(CONNECTED_KEY, "1");
  window.localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}

/** Подключить Google Drive: получить согласие пользователя и запомнить выбор. */
export async function connectDrive(): Promise<void> {
  await requireToken();
  window.localStorage.setItem(CONNECTED_KEY, "1");
}

/**
 * Скачать текущий backup из Google Drive. Возвращает JSON-строку —
 * вызывающий код должен прогнать её через parseBackupJson → applyBackup
 * (тот же validated import, что и для файла).
 */
export async function downloadCloudBackupJson(): Promise<string> {
  const { token } = await requireToken();
  const file = await findBackupFile(token);
  if (!file) {
    throw new Error("В Google Drive ещё нет резервной копии Silentium. Сначала выполните синхронизацию");
  }
  const response = await driveFetch(
    `${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media`,
    token,
  );
  if (!response.ok) {
    throw new Error(`Не удалось скачать резервную копию из Google Drive (${response.status})`);
  }
  return response.text();
}

/**
 * Удалить резервную копию из Google Drive. Локальные данные и флаг
 * подключения не затрагиваются: после удаления можно снова синхронизировать.
 */
export async function deleteCloudBackup(): Promise<void> {
  const { token } = await requireToken();
  const file = await findBackupFile(token);
  if (!file) {
    throw new Error("В Google Drive нет резервной копии Silentium");
  }
  const response = await driveFetch(
    `${DRIVE_API}/files/${encodeURIComponent(file.id)}`,
    token,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(`Не удалось удалить резервную копию из Google Drive (${response.status})`);
  }
}

/** Форматирование timestamp синхронизации: «28.09.2026, 09:42». */
export function formatSyncTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

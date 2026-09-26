/**
 * Форматирование дат. Везде работаем со строками YYYY-MM-DD и разбираем их
 * вручную: new Date('YYYY-MM-DD') парсится как UTC и сдвигает дату в других
 * часовых поясах.
 */

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

const WEEKDAYS = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
] as const;

function parseDateParts(dateStr: string): { day: number; month: number; year: number; weekday: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // День недели из UTC-полуночи — детерминирован для строки даты.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { day, month, year, weekday };
}

/** «12 сентября 2026». */
export function formatDateRu(dateStr: string): string {
  const parts = parseDateParts(dateStr);
  if (!parts) return dateStr;
  return `${parts.day} ${MONTHS_GENITIVE[parts.month - 1]} ${parts.year}`;
}

/** «12 сентября». */
export function formatDateShortRu(dateStr: string): string {
  const parts = parseDateParts(dateStr);
  if (!parts) return dateStr;
  return `${parts.day} ${MONTHS_GENITIVE[parts.month - 1]}`;
}

/** «суббота». */
export function formatWeekdayRu(dateStr: string): string {
  const parts = parseDateParts(dateStr);
  if (!parts) return "";
  return WEEKDAYS[parts.weekday];
}

/** «сегодня» | «вчера» | null — если dateStr не сегодня/вчера по локальным часам. */
export function relativeDayLabel(dateStr: string, todayStr: string): string | null {
  if (dateStr === todayStr) return "сегодня";
  const yesterday = new Date(`${todayStr}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  if (dateStr === yStr) return "вчера";
  return null;
}

/** «90 мин» → «1 ч 30 мин»; для значений меньше часа — минуты. */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} мин`;
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

/** Локальная дата клиента YYYY-MM-DD. Только на клиенте (мобильный ввод). */
export function todayLocalDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Клиентская метка времени из будущего прижимается к серверному «сейчас» —
 * защита LWW и сортировки от переведённых часов устройства
 * (docs/offline-write-sync-design.md, раздел 13).
 */
export function clampToNow(date: Date, now: Date = new Date()): Date {
  return date.getTime() > now.getTime() ? now : date;
}

/** «12 сентября» + будний день для заголовков ленты: «12 сентября · суббота». */
export function formatDateHeader(dateStr: string, todayStr: string): string {
  const short = formatDateShortRu(dateStr);
  const relative = relativeDayLabel(dateStr, todayStr);
  if (relative) return `${short} · ${relative}`;
  return short;
}

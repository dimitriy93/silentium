/**
 * Период суток для фона комнаты. Локальное время клиента:
 * 05:00–11:59 morning, 12:00–16:59 afternoon, 17:00–21:59 evening, 22:00–04:59 night.
 */

import { withBasePath } from "@/lib/base-path";

export type RoomPeriod = "morning" | "afternoon" | "evening" | "night";

export const ROOM_IMAGES: Record<RoomPeriod, string> = {
  morning: withBasePath("/room/room_morning.webp"),
  afternoon: withBasePath("/room/room_afternoon.webp"),
  evening: withBasePath("/room/room_evening.webp"),
  night: withBasePath("/room/room_night.webp"),
};

export function roomPeriodForHour(hour: number): RoomPeriod {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

/** Предзагрузка всех фонов — кроссфейд между ними должен быть мгновенным. */
export function preloadRoomImages(): void {
  for (const src of Object.values(ROOM_IMAGES)) {
    const img = new Image();
    img.src = src;
  }
}

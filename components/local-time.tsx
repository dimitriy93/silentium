"use client";

/** Время записи в локальном часовом поясе пользователя (createdAt — UTC). */
export default function LocalTime({ utc }: { utc: string }) {
  return (
    <time dateTime={utc}>
      {new Date(utc).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}

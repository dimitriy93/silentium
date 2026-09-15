/**
 * Smoke-тест слоя данных Silentium (npm run db:smoke).
 *
 * Запускается по DATABASE_URL (нужен живой Postgres с применёнными
 * миграциями: npm run db:migrate). Имитирует зарегистрированного
 * пользователя (строка в auth.users — триггер создаёт профиль и
 * RPG-профиль), затем прогоняет основные сценарии всех разделов через
 * withUserDb (RLS) и проверяет результаты. Чистит за собой.
 *
 * Это dev-инструмент; в приложении userId всегда берётся из сессии Supabase.
 */
import "./env-load";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import * as schema from "../lib/db/schema";
import { withUserDb } from "../lib/db";
import {
  createAsceticism,
  ensureAsceticismStreaks,
  listAsceticismAchievements,
  listAsceticismLogsForDay,
  listAsceticisms,
  restartAsceticismStreak,
  setAsceticismLog,
  updateAsceticism,
} from "../lib/asceticism";
import { getDayEntries, listDaySummaries, upsertAiDailyMemory } from "../lib/day";
import { createLeisureEntry, listLeisureForDay } from "../lib/leisure";
import {
  createCreationEntry,
  createLearningEntry,
  createTrainingActivity,
  deleteTrainingActivity,
  getNutritionForDay,
  listCreationForDay,
  listLearningForDay,
  listTrainingForDay,
  upsertNutrition,
} from "../lib/path";
import {
  createThought,
  deleteThought,
  listThoughtsForDay,
  updateThought,
} from "../lib/thoughts";


let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  // SMOKE_ADMIN_URL — подключение с правами владельца (сеять/чистить auth.users).
  // DATABASE_URL — роль приложения (не суперпользователь): только через RLS.
  // На Supabase это одна и та же строка; локально суперпользователь обошёл бы RLS.
  const adminUrl = process.env.SMOKE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!adminUrl || !process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  // Пулер Supabase в плохой фазе рвёт соединение после нескольких обменов,
  // а postgres.js молча переочередивает запросы. Поэтому каждый admin-запрос
  // идёт на свежем соединении с ретраями (как в scripts/apply-migrations.mjs).
  async function admin(strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]> {
    let lastErr;
    for (let attempt = 1; attempt <= 4; attempt++) {
      const sql = postgres(adminUrl!, { prepare: false, max: 1, connect_timeout: 15 });
      try {
        const r = (await sql(strings, ...(values as never[]))) as unknown as Record<string, unknown>[];
        await sql.end();
        return r;
      } catch (e) {
        lastErr = e;
        await sql.end().catch(() => {});
        const msg = String((e as Error)?.message ?? e);
        if (!/ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|connection terminated|socket hang up/i.test(msg)) throw e;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    throw lastErr;
  }

  const userId = randomUUID();
  const testUserIds: string[] = [userId];
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  try {
    // Пользователь в auth.users — триггер создаёт profiles + rpg_profiles.
    await admin`insert into auth.users (id, email, raw_user_meta_data, created_at)
      values (${userId}, ${`smoke-${userId}@silentium.local`}::text, '{}'::jsonb, now())`;
    const [profile] = await admin`select * from profiles where id = ${userId}`;
    check("триггер создаёт profile", Boolean(profile));
    const [rpg] = await admin`select * from rpg_profiles where user_id = ${userId}`;
    check("триггер создаёт rpg_profile (level=1, xp=0)", rpg?.level === 1 && rpg?.xp === 0);

    // Мысли.
    const thought = await createThought(userId, date, "Первая мысль о дисциплине");
    check("создание мысли", thought.content === "Первая мысль о дисциплине");
    await updateThought(userId, thought.id, "Отредактированная мысль");
    const dayThoughts = await listThoughtsForDay(userId, date);
    check("редактирование мысли", dayThoughts[0]?.content === "Отредактированная мысль");
    check("удаление мысли", await deleteThought(userId, thought.id));
    check("мысль удалена", (await listThoughtsForDay(userId, date)).length === 0);

    // Путь: Огонь.
    const training = await createTrainingActivity(userId, date, {
      title: "Подтягивания",
      detail: "+31.5 кг × 6/6/5/5",
      durationMinutes: 45,
    });
    check("огонь: запись активности", (await listTrainingForDay(userId, date)).length === 1);
    check("огонь: удаление", await deleteTrainingActivity(userId, training.id));

    // Путь: Вода (upsert — одна строка на день).
    await upsertNutrition(userId, date, {
      calories: 3034,
      proteinGrams: 160,
      fatGrams: 130,
      carbsGrams: 304,
      note: "обычный день",
    });
    await upsertNutrition(userId, date, { calories: 2900 });
    const nutrition = await getNutritionForDay(userId, date);
    check("вода: upsert обновляет и сохраняет остальное", nutrition?.calories === 2900 && nutrition?.note === "обычный день");

    // Путь: Воздух и Земля.
    await createLearningEntry(userId, date, "Изучил индексы Postgres");
    check("воздух: запись", (await listLearningForDay(userId, date)).length === 1);
    await createCreationEntry(userId, date, "Собрал схему Silentium");
    check("земля: запись", (await listCreationForDay(userId, date)).length === 1);

    // Развлечения.
    await createLeisureEntry(userId, date, { title: "YouTube", minutes: 20 });
    const leisure = await listLeisureForDay(userId, date);
    check("развлечения: запись", leisure.length === 1 && leisure[0].minutes === 20);

    // Аскезы.
    const asceticism = await createAsceticism(userId, {
      title: "Не смотреть короткие видео",
      startDate: date,
    });
    const list = await listAsceticisms(userId);
    check("аскеза: создание", list.length === 1 && list[0].isActive);
    await setAsceticismLog(userId, asceticism.id, date, "done");
    const logs = await listAsceticismLogsForDay(userId, date);
    check("аскеза: отметка done", logs[0]?.status === "done");
    await setAsceticismLog(userId, asceticism.id, date, "failed");
    const logs2 = await listAsceticismLogsForDay(userId, date);
    check("аскеза: смена отметки на failed", logs2[0]?.status === "failed");
    await setAsceticismLog(userId, asceticism.id, date, null);
    check("аскеза: снятие отметки", (await listAsceticismLogsForDay(userId, date)).length === 0);

    // Серии и достижения.
    const shift = (days: number): string => {
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };

    // 1. Новая аскеза: строка серии создана сразу, серия нулевая.
    const streakAsc = await createAsceticism(userId, {
      title: "Серия: не пропускать зарядку",
      startDate: shift(-400),
    });
    const streaks1 = await ensureAsceticismStreaks(userId, date);
    const s1 = streaks1.find((s) => s.asceticismId === streakAsc.id);
    check(
      "серия: новая аскеза — серия 0, порог 0",
      s1 !== undefined && s1.currentStreak === 0 && s1.bestMilestone === 0,
    );

    // 2. Серия 3 дня.
    for (const off of [-2, -1, 0]) {
      await setAsceticismLog(userId, streakAsc.id, shift(off), "done", date);
    }
    const streaks3 = (await ensureAsceticismStreaks(userId, date)).find(
      (s) => s.asceticismId === streakAsc.id,
    );
    check(
      "серия: 3 дня — current 3, best 3",
      streaks3?.currentStreak === 3 && streaks3.bestMilestone === 3,
    );

    // 3. Серия 10 дней (дорисовываем дни до 10).
    for (let off = -9; off <= -3; off++) {
      await setAsceticismLog(userId, streakAsc.id, shift(off), "done", date);
    }
    const streaks10 = (await ensureAsceticismStreaks(userId, date)).find(
      (s) => s.asceticismId === streakAsc.id,
    );
    check(
      "серия: 10 дней — current 10, best 10",
      streaks10?.currentStreak === 10 && streaks10.bestMilestone === 10,
    );
    const ach10 = await listAsceticismAchievements(userId);
    check(
      "достижение: порог 10 у аскезы",
      ach10.some((a) => a.asceticismId === streakAsc.id && a.milestone === 10),
    );

    // 4. Серия 50 дней: best обновляется до 50.
    for (let off = -49; off <= -10; off++) {
      await setAsceticismLog(userId, streakAsc.id, shift(off), "done", date);
    }
    const streaks50 = (await ensureAsceticismStreaks(userId, date)).find(
      (s) => s.asceticismId === streakAsc.id,
    );
    check(
      "серия: 50 дней — current 50, best 50",
      streaks50?.currentStreak === 50 && streaks50.bestMilestone === 50,
    );
    const ach50 = await listAsceticismAchievements(userId);
    const achStreak = ach50.find((a) => a.asceticismId === streakAsc.id);
    check(
      "достижение: у аскезы хранится только максимум (Кубок 50, не 10)",
      achStreak?.milestone === 50 && ach50.filter((a) => a.asceticismId === streakAsc.id).length === 1,
    );

    // 5. Прерывание серии: failed вчера — серия живёт только на сегодня.
    await setAsceticismLog(userId, streakAsc.id, shift(-1), "failed", date);
    const streaksBreak = (await ensureAsceticismStreaks(userId, date)).find(
      (s) => s.asceticismId === streakAsc.id,
    );
    check(
      "серия: failed обрывает серию (current 1), достижение 50 осталось",
      streaksBreak?.currentStreak === 1 && streaksBreak.bestMilestone === 50,
    );

    // 6. Закрытие (деактивация): серия заканчивается, достижение остаётся.
    await updateAsceticism(userId, streakAsc.id, { isActive: false });
    const achClosed = await listAsceticismAchievements(userId);
    check(
      "закрытие: достижение 50 сохраняется после деактивации",
      achClosed.some((a) => a.asceticismId === streakAsc.id && a.milestone === 50),
    );

    // 7. Повторный запуск: серия начинается заново с today.
    await updateAsceticism(userId, streakAsc.id, { isActive: true });
    await restartAsceticismStreak(userId, streakAsc.id, date);
    const streaksRestart = (await ensureAsceticismStreaks(userId, date)).find(
      (s) => s.asceticismId === streakAsc.id,
    );
    check(
      "повторный запуск: серия сброшена, best 50 сохранён",
      streaksRestart?.currentStreak === 0 && streaksRestart?.bestMilestone === 50,
    );
    await setAsceticismLog(userId, streakAsc.id, date, "done", date);
    const streaksAfterRestart = (await ensureAsceticismStreaks(userId, date)).find(
      (s) => s.asceticismId === streakAsc.id,
    );
    check(
      "повторный запуск: новая серия считается только с даты запуска",
      streaksAfterRestart?.currentStreak === 1 && streaksAfterRestart.bestMilestone === 50,
    );

    // 8. Backfill по существующей истории: аскеза со старыми done-отметками.
    const backfillAsc = await createAsceticism(userId, {
      title: "Backfill: серия из истории",
      startDate: shift(-6),
    });
    for (let off = -6; off <= -4; off++) {
      await setAsceticismLog(userId, backfillAsc.id, shift(off), "done", date);
    }
    const backfillStreak = (await ensureAsceticismStreaks(userId, date)).find(
      (s) => s.asceticismId === backfillAsc.id,
    );
    check(
      "backfill: история пересчитана (серия 0, достижение 3)",
      backfillStreak?.currentStreak === 0 && backfillStreak.bestMilestone === 3,
    );

    // День / история.
    const dayEntries = await getDayEntries(userId, date);
    check(
      "день: агрегат разделов",
      dayEntries.learning.length === 1 &&
        dayEntries.creation.length === 1 &&
        dayEntries.leisure.length === 1 &&
        dayEntries.nutrition !== null,
    );
    const summaries = await listDaySummaries(userId);
    // Дни с отметками аскез без записей остальных разделов не считаем пустыми.
    const nonEmptyDays = summaries.filter((s) => s.totalEntries > 0);
    check("история: список дней", nonEmptyDays.length === 1 && nonEmptyDays[0].totalEntries === 4);

    // AI-память (выжимка дня).
    await upsertAiDailyMemory(
      userId,
      date,
      { summary: "тест", observations: ["1"], adherence: "ok" },
      "smoke-test",
    );
    await upsertAiDailyMemory(
      userId,
      date,
      { summary: "тест-2", observations: ["2"], adherence: "ok" },
      "smoke-test",
    );
    const [memory] = await admin`select content from ai_daily_memories where user_id = ${userId}`;
    check(
      "AI-память: upsert одной выжимки на день",
      (memory?.content as { summary?: string })?.summary === "тест-2",
    );

    // Изоляция пользователей (RLS): чужие записи недоступны.
    const otherUser = randomUUID();
    await admin`insert into auth.users (id, email, raw_user_meta_data, created_at)
      values (${otherUser}, ${`smoke-${otherUser}@silentium.local`}::text, '{}'::jsonb, now())`;
    const otherThoughts = await withUserDb(otherUser, (tx) => tx.select().from(schema.thoughts));
    check("RLS: чужой пользователь не видит записей", otherThoughts.length === 0);
    await createThought(otherUser, date, "чужая запись");
    const isolated = await withUserDb(userId, (tx) => tx.select().from(schema.thoughts));
    check("RLS: изоляция записей между пользователями", isolated.length === 0);
    testUserIds.push(otherUser);
  } finally {
    for (const id of testUserIds) {
      await admin`delete from auth.users where id = ${id}`;
    }
  }

  if (failures > 0) {
    console.error(`\nПровалено проверок: ${failures}`);
    process.exitCode = 1;
  } else {
    console.log("\nВсе проверки пройдены.");
  }
}

void main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    // Пул lib/db намеренно живёт до конца процесса — завершаем скрипт явно.
    // Небольшая задержка: мгновенный process.exit обрезает буферизованный
    // stdout при перенаправлении вывода (часть проверок терялась).
    setTimeout(() => process.exit(process.exitCode ?? 0), 300);
  });

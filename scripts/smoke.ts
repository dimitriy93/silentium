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
import dotenv from "dotenv";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import * as schema from "../lib/db/schema";
import { withUserDb } from "../lib/db";
import {
  createAsceticism,
  listAsceticismLogsForDay,
  listAsceticisms,
  setAsceticismLog,
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

dotenv.config({ path: ".env.local" });
dotenv.config();

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
  const admin = postgres(adminUrl, { prepare: false });

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
    check("история: список дней", summaries.length === 1 && summaries[0].totalEntries === 4);

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
    await admin.end();
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
    process.exit(process.exitCode ?? 0);
  });

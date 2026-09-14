import { and, desc, eq } from "drizzle-orm";
import { withUserDb } from "@/lib/db";
import { mentorMessages, mentorPrompts } from "@/lib/db/schema";

/**
 * Слой данных наставника: чтение system prompt (его рабочая версия хранится
 * в БД и редактируется без деплоя), чтение последнего наставления дня и
 * сохранение нового. Вызов модели (Gemini) — в actions/mentor.ts и
 * lib/mentor/*: полная история никогда не отправляется модели, только
 * структурированные записи конкретного дня.
 */
export const MENTOR_SYSTEM_PROMPT_KEY = "system";

export async function getMentorSystemPrompt(userId: string): Promise<string | null> {
  return withUserDb(userId, async (tx) => {
    const rows = await tx
      .select({ content: mentorPrompts.content })
      .from(mentorPrompts)
      .where(eq(mentorPrompts.key, MENTOR_SYSTEM_PROMPT_KEY))
      .limit(1);
    return rows[0]?.content ?? null;
  });
}

/** Последнее наставление наставника за дату (если день уже разобран). */
export async function getLatestMentorMessage(
  userId: string,
  entryDate: string,
): Promise<string | null> {
  return withUserDb(userId, async (tx) => {
    const rows = await tx
      .select({ content: mentorMessages.content })
      .from(mentorMessages)
      .where(
        and(
          eq(mentorMessages.userId, userId),
          eq(mentorMessages.entryDate, entryDate),
          eq(mentorMessages.role, "mentor"),
        ),
      )
      .orderBy(desc(mentorMessages.createdAt))
      .limit(1);
    return rows[0]?.content ?? null;
  });
}

/** Сохраняет наставление за дату (role = 'mentor'). */
export async function saveMentorMessage(
  userId: string,
  entryDate: string,
  content: string,
): Promise<void> {
  await withUserDb(userId, async (tx) => {
    await tx.insert(mentorMessages).values({ userId, entryDate, role: "mentor", content });
  });
}

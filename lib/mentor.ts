import { eq } from "drizzle-orm";
import { withUserDb } from "@/lib/db";
import { mentorPrompts } from "@/lib/db/schema";

/**
 * Слой данных наставника. На этом этапе AI-логики нет: только чтение
 * system prompt (его рабочая версия хранится в БД и редактируется без
 * деплоя) и структура сообщений — таблица mentor_messages.
 *
 * Будущий поток (после завершения дня):
 * 1) собрать записи дня;
 * 2) создать/обновить ai_daily_memories (выжимка дня);
 * 3) записать наставление в mentor_messages (role = 'mentor').
 * Полная история никогда не отправляется модели — только выжимки.
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

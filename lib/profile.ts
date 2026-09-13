import { eq } from "drizzle-orm";
import { withUserDb } from "@/lib/db";
import { rpgProfiles, type RpgProfile } from "@/lib/db/schema";

/**
 * RPG-профиль пользователя. Система XP на этом этапе не реализована:
 * профиль существует (level = 1, xp = 0, rank = 'novice') и создаётся
 * триггером при регистрации. Начисление опыта — следующий этап.
 */
export async function getRpgProfile(userId: string): Promise<RpgProfile | null> {
  return withUserDb(userId, async (tx) => {
    const rows = await tx
      .select()
      .from(rpgProfiles)
      .where(eq(rpgProfiles.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  });
}

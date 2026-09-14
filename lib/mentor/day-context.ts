import type { DayEntries } from "@/lib/day";

/**
 * Структурированный контекст дня для Наставника. Собирается из тех же
 * записей, что читает Today/история (getDayEntries), — никаких выдуманных
 * данных. В модель уходит только то, что нужно для разбора дня: без id,
 * user_id, служебных полей и метаданных.
 */

export interface MentorDayContext {
  date: string;
  asceticism: Array<{ title: string; status: "выполнено" | "не выполнено" }>;
  training: Array<{ title: string; detail: string | null; minutes: number | null }>;
  learning: string[];
  creation: string[];
  nutrition: {
    calories: number | null;
    proteinGrams: number | null;
    fatGrams: number | null;
    carbsGrams: number | null;
    note: string | null;
  } | null;
  leisure: Array<{ title: string; minutes: number | null }>;
  thoughts: string[];
}

/**
 * Контекст дня. Отметки аскез из getDayEntries не содержат названий,
 * поэтому карта asceticismId → title передаётся отдельно (читается тем же
 * слоем данных аскез).
 */
export function buildMentorDayContext(
  entries: DayEntries,
  asceticismTitles: Map<string, string>,
): MentorDayContext {
  return {
    date: entries.entryDate,
    asceticism: entries.asceticismLogs.map((log) => ({
      title: asceticismTitles.get(log.asceticismId) ?? "аскеза",
      status: log.status === "done" ? ("выполнено" as const) : ("не выполнено" as const),
    })),
    training: entries.training.map((t) => ({
      title: t.title,
      detail: t.detail,
      minutes: t.durationMinutes,
    })),
    learning: entries.learning.map((l) => l.content),
    creation: entries.creation.map((c) => c.content),
    nutrition: entries.nutrition
      ? {
          calories: entries.nutrition.calories,
          proteinGrams: entries.nutrition.proteinGrams,
          fatGrams: entries.nutrition.fatGrams,
          carbsGrams: entries.nutrition.carbsGrams,
          note: entries.nutrition.note,
        }
      : null,
    leisure: entries.leisure.map((l) => ({ title: l.title, minutes: l.minutes })),
    thoughts: entries.thoughts.map((t) => t.content).slice(0, 20),
  };
}

/**
 * Промпт для модели: строгие правила анализа только по переданным данным.
 * Тон и характер задаёт system prompt из БД (или дефолт из кода).
 */
export function buildMentorUserPrompt(context: MentorDayContext): string {
  const pathEmpty =
    context.training.length === 0 &&
    context.learning.length === 0 &&
    context.creation.length === 0 &&
    context.nutrition === null;

  const dataJson = JSON.stringify(
    {
      дата: context.date,
      аскезы: context.asceticism,
      огонь_физическая_активность: context.training,
      воздух_изучение: context.learning,
      земля_созидание: context.creation,
      питание: context.nutrition,
      развлечения_отвлечения: context.leisure,
      мысли: context.thoughts,
    },
    null,
    1,
  );

  return `Вот все записи дня пользователя в формате JSON (это единственный источник фактов; пустой массив или null означает, что записи нет):

${dataJson}

Подведи итог дня. Правила:
- Анализируй ТОЛЬКО эти данные. Не выдумывай завершённые дела, эмоции и обстоятельства, которых здесь нет.
- Отделяй зафиксированные факты от интерпретации. Интерпретацию помечай как твоё наблюдение.
- Честный разбор дня: отмечай реальный прогресс, но не хвали, если данные его не показывают, и не стыди. Молчание в записях — тоже факт, назови его.
- Указывай на несостыковки, только если это видно в данных (например, развлечения при пустом пути).
- Без общих мотивационных клише, без смайликов, без вступлений и прощаний.
- Структура ответа: краткая выжимка дня (2–3 предложения по фактам), наблюдение (что видно из данных), наставление на завтра (конкретное, привязанное к записям).
${pathEmpty ? "Записей пути за день нет — прямо скажи об этом, не выдумывай активности." : ""}`;
}

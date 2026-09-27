import type { MetadataRoute } from "next";
import { withBasePath } from "@/lib/base-path";

// Статический экспорт: manifest.webmanifest генерируется как файл.
export const dynamic = "force-static";

/**
 * PWA-манифест: устанавливаемое приложение Silentium. Пути с базовым
 * префиксом — при деплое в подпапку (NEXT_PUBLIC_BASE_PATH) манифест
 * остаётся корректным; по умолчанию — корень хостинга.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Silentium — безмолвная дисциплина",
    short_name: "Silentium",
    description: "Дневник дисциплины, развития и самоанализа",
    id: withBasePath("/"),
    start_url: withBasePath("/today"),
    scope: withBasePath("/"),
    display: "standalone",
    orientation: "portrait",
    lang: "ru",
    background_color: "#0a0f1c",
    theme_color: "#0a0f1c",
    // Основная PWA-иконка: work_files/icon.png, фактический размер 600×600.
    // Маскируемость не заявляем — у иконки обычный прямоугольный формат.
    icons: [
      {
        src: withBasePath("/icons/icon.png"),
        sizes: "600x600",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

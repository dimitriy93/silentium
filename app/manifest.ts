import type { MetadataRoute } from "next";

/** PWA-манифест: устанавливаемое приложение Silentium. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Silentium — безмолвная дисциплина",
    short_name: "Silentium",
    description: "Дневник дисциплины, развития и самоанализа",
    id: "/",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "ru",
    background_color: "#0a0f1c",
    theme_color: "#0a0f1c",
    // Основная PWA-иконка: work_files/icon.png, фактический размер 600×600.
    // Маскируемость не заявляем — у иконки обычный прямоугольный формат.
    icons: [{ src: "/icons/icon.png", sizes: "600x600", type: "image/png", purpose: "any" }],
  };
}

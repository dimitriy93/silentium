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
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

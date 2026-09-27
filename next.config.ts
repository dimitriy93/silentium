import type { NextConfig } from "next";

/**
 * Полностью статический экспорт: `npm run build` создаёт каталог `out/`
 * с HTML/JS/CSS и PWA-ассетами, пригодный для любого static-хостинга
 * (GitHub Pages, nginx, S3). Серверных возможностей приложение не использует.
 *
 * NEXT_PUBLIC_BASE_PATH — необязательный префикс для размещения в подпапке
 * (например GitHub Pages <user>.github.io/<repo>): достаточно задать его на
 * сборке, в самом приложении привязки к хостингу нет.
 */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "export",
  // Directory-URLs (`/today/` → `today/index.html`): resolve на любом
  // static-хостинге, включая GitHub Pages (который не отдаёт .html по
  // бесрасширному пути).
  trailingSlash: true,
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;

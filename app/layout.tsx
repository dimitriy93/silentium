import type { Metadata, Viewport } from "next";
import SwRegistration from "@/components/sw-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Silentium",
  description: "Безмолвная дисциплина — дневник дисциплины, развития и самоанализа",
  manifest: "/manifest.webmanifest",
  // favicon.ico и apple-icon подключаются через конвенции app/favicon.ico и
  // app/apple-icon.png — здесь ссылок на иконки больше не нужно.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Silentium" },
};

// viewport-fit=cover — обязателен для env(safe-area-inset-*) на iPhone.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#0a0f1c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        {children}
        <SwRegistration />
      </body>
    </html>
  );
}

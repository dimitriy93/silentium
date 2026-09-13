import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Silentium",
  description: "Безмолвная дисциплина — дневник дисциплины, развития и самоанализа",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Silentium" },
};

// viewport-fit=cover — обязателен для env(safe-area-inset-*) на iPhone.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#17110b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

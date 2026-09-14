import type { Metadata, Viewport } from "next";
import SwRegistration from "@/components/sw-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Silentium",
  description: "Безмолвная дисциплина — дневник дисциплины, развития и самоанализа",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
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

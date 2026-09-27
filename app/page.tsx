"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import OrbitalLoader from "@/components/orbital-loader";

/**
 * Корневой маршрут: сразу переводит на «Сегодня». Клиентский редирект —
 * при статическом экспорте страница «/» это статический HTML, серверного
 * redirect не существует; лоадер закрывает мгновение до перехода.
 */
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/today");
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center">
      <OrbitalLoader />
    </main>
  );
}

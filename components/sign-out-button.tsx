"use client";

import { useState } from "react";
import { signOut } from "@/actions/auth";
import { clearLocalSession, outboxStats } from "@/lib/local/outbox";

/**
 * Выход из аккаунта. Если в очереди есть неотправленные записи —
 * предупреждение: после очистки локальных данных они будут потеряны
 * (docs/offline-write-sync-design.md, раздел 10).
 */
export default function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      const { pending } = await outboxStats();
      if (
        pending > 0 &&
        !confirm(
          `${pending} записей ещё не синхронизированы и будут потеряны. Выйти?`,
        )
      ) {
        setBusy(false);
        return;
      }
    } catch {
      // Очередь недоступна — выходим без предупреждения.
    }
    try {
      // signOut завершается редиректом; локальную очистку делаем до него.
      await clearLocalSession();
    } catch {
      // игнорируем
    }
    try {
      await signOut();
    } catch {
      // redirect серверного экшена обрабатывает Next.js
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={busy}
      className="btn-ghost h-12 w-full text-sm"
    >
      Выйти
    </button>
  );
}

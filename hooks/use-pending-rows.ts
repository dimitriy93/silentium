"use client";

import { useEffect, useState } from "react";
import { pendingRowIds } from "@/lib/local/outbox";
import { useSync } from "@/lib/local/sync-context";
import type { OutboxEntity } from "@/lib/local/outbox-types";

/**
 * rowId записей сущности, ещё не подтверждённые Башней (в очереди или в
 * пути) — для ненавязчивой метки «запись сохранена на устройстве» рядом
 * с записью. Обновляется после каждой синхронизации и локальной мутации.
 */
export function usePendingRows(entity: OutboxEntity): Set<string> {
  const { version } = useSync();
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let active = true;
    void pendingRowIds(entity).then((next) => {
      if (active) setIds(next);
    });
    return () => {
      active = false;
    };
  }, [entity, version]);
  return ids;
}

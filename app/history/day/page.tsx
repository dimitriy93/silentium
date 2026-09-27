import { Suspense } from "react";
import BottomNav from "@/components/bottom-nav";
import HistoryDayView from "@/components/history-day-view";

/**
 * Один день истории: дата приходит query-параметром (?date=YYYY-MM-DD) —
 * при статическом экспорте динамические маршруты недоступны, а все данные
 * дня читает клиентский HistoryDayView из локальной базы (IndexedDB).
 */
export default function HistoryDayPage() {
  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-4 px-5 pt-[max(env(safe-area-inset-top),32px)]">
        <Suspense fallback={null}>
          <HistoryDayView />
        </Suspense>
      </div>
      <BottomNav />
    </main>
  );
}

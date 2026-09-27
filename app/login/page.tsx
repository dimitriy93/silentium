import LoginForm from "@/components/login-form";

/**
 * Статическая страница входа. Перенаправление авторизованного пользователя
 * выполняет middleware — серверная проверка здесь больше не нужна.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-[400px] space-y-8">
        <header className="space-y-2 text-center">
          <h1 className="font-chronicle text-4xl tracking-[0.14em] text-[var(--gold)]">
            SILENTIUM
          </h1>
          <p className="text-sm text-[var(--ink-secondary)]">Безмолвная дисциплина</p>
        </header>
        <LoginForm />
      </div>
    </main>
  );
}

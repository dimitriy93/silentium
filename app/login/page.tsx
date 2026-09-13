import { redirect } from "next/navigation";
import LoginForm from "@/components/login-form";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/today");
  }

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

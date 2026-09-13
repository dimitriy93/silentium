"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type SignInState } from "@/actions/auth";

const initialState: SignInState = {};

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input
        className="field h-12 w-full px-4 text-base"
        type="email"
        name="email"
        placeholder="Email"
        autoComplete="email"
        required
      />
      <input
        className="field h-12 w-full px-4 text-base"
        type="password"
        name="password"
        placeholder="Пароль"
        autoComplete="current-password"
        required
      />

      {state.error ? <p className="text-sm text-[#c96a5a]">{state.error}</p> : null}

      <button type="submit" disabled={pending} className="btn-bronze h-12 w-full text-base">
        {pending ? "Вхожу…" : "Войти"}
      </button>

      <p className="pt-2 text-center text-sm text-[var(--ink-secondary)]">
        Нет доступа?{" "}
        <Link href="/register" className="text-[var(--gold)] underline-offset-4 hover:underline">
          Регистрация
        </Link>
      </p>
    </form>
  );
}

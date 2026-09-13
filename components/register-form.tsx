"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type SignUpState } from "@/actions/auth";

const initialState: SignUpState = {};

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

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
        placeholder="Пароль (от 8 символов)"
        autoComplete="new-password"
        required
      />
      <input
        className="field h-12 w-full px-4 text-base"
        type="password"
        name="confirmPassword"
        placeholder="Повторите пароль"
        autoComplete="new-password"
        required
      />
      <input
        className="field h-12 w-full px-4 text-base"
        type="password"
        name="inviteKey"
        placeholder="Ключ приглашения"
        required
      />

      {state.error ? <p className="text-sm text-[#c96a5a]">{state.error}</p> : null}

      <button type="submit" disabled={pending} className="btn-bronze h-12 w-full text-base">
        {pending ? "Создаю…" : "Создать дневник"}
      </button>

      <p className="pt-2 text-center text-sm text-[var(--ink-secondary)]">
        Уже есть доступ?{" "}
        <Link href="/login" className="text-[var(--gold)] underline-offset-4 hover:underline">
          Войти
        </Link>
      </p>
    </form>
  );
}

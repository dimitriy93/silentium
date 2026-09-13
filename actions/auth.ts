"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = { error?: string };
export type SignUpState = { error?: string };

/** Список email, которым разрешена регистрация (env ALLOWED_EMAILS, через запятую). */
function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Закрытая регистрация: только по ключу приглашения и только для email
 * из whitelist. Ключ и whitelist живут в env и проверяются только на сервере.
 */
export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const inviteKey = String(formData.get("inviteKey") ?? "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Введите корректный email" };
  }
  if (password.length < 8) {
    return { error: "Пароль должен быть не короче 8 символов" };
  }
  if (password !== confirmPassword) {
    return { error: "Пароли не совпадают" };
  }
  if (!inviteKey) {
    return { error: "Введите ключ приглашения" };
  }

  const expectedKey = process.env.INVITE_KEY ?? "";
  if (!expectedKey || inviteKey !== expectedKey) {
    return { error: "Регистрация запрещена" };
  }
  if (!getAllowedEmails().includes(email)) {
    return { error: "Регистрация запрещена" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (error.message === "User already registered") {
      return { error: "Пользователь с таким email уже зарегистрирован" };
    }
    console.error("signUp failed:", error.message);
    return { error: "Не удалось зарегистрироваться. Попробуйте позже." };
  }

  // Подтверждение email отключено в Dashboard — сессия выдана сразу.
  if (data.session) {
    redirect("/today");
  }

  // Сессии нет (включено подтверждение email) — просим подтвердить почту.
  return { error: "Подтвердите email по ссылке из письма, затем войдите" };
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Введите email и пароль" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error("signIn failed:", error.message);
    return { error: "Неверный email или пароль" };
  }

  redirect("/today");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

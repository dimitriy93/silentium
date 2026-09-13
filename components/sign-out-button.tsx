"use client";

import { signOut } from "@/actions/auth";

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="btn-ghost h-12 w-full text-sm"
    >
      Выйти
    </button>
  );
}

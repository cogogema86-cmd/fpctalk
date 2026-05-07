"use client";

import { logoutAction } from "../actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        로그아웃
      </button>
    </form>
  );
}

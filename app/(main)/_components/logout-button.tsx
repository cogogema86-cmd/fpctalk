"use client";

import { logoutAction } from "../actions";
import { useT } from "@/lib/i18n/client";

export function LogoutButton() {
  const t = useT();
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        {t("header.logout")}
      </button>
    </form>
  );
}

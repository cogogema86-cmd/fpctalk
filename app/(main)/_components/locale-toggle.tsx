"use client";

import { useTransition } from "react";
import { setLocaleAction } from "@/app/_actions/locale";
import { type Locale } from "@/lib/i18n/dictionary";

export function LocaleToggle({ current }: { current: Locale }) {
  const [isPending, startTransition] = useTransition();

  const set = (loc: Locale) => {
    if (loc === current || isPending) return;
    startTransition(async () => {
      await setLocaleAction(loc);
    });
  };

  return (
    <div className="inline-flex items-center rounded-md border border-zinc-300 dark:border-zinc-700 overflow-hidden text-xs font-medium">
      <button
        type="button"
        onClick={() => set("ko")}
        disabled={isPending}
        aria-pressed={current === "ko"}
        className={
          current === "ko"
            ? "px-2 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
            : "px-2 py-1 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-50"
        }
      >
        KO
      </button>
      <button
        type="button"
        onClick={() => set("en")}
        disabled={isPending}
        aria-pressed={current === "en"}
        className={
          current === "en"
            ? "px-2 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
            : "px-2 py-1 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-50"
        }
      >
        EN
      </button>
    </div>
  );
}

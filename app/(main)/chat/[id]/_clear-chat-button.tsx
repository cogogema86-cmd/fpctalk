"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearChatRoomAction } from "../actions";
import { useT } from "@/lib/i18n/client";

export function ClearChatButton({ chatId }: { chatId: string }) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    if (
      !confirm(
        t("chat.clearConfirm"),
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await clearChatRoomAction(chatId);
      if (!r.ok) {
        setError(r.error ?? "초기화 실패");
        return;
      }
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      title={error ?? t("chat.clearTitle")}
      className="text-xs rounded-md border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 px-2 py-1 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50 shrink-0"
    >
      {isPending ? t("chat.clearing") : `🗑 ${t("chat.clearAll")}`}
    </button>
  );
}

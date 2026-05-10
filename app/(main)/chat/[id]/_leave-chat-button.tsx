"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { leaveChatAction } from "../actions";
import { useT } from "@/lib/i18n/client";

export function LeaveChatButton({
  chatId,
  isDm,
}: {
  chatId: string;
  isDm: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    if (
      !confirm(isDm ? t("chat.leaveConfirmDm") : t("chat.leaveConfirmGroup"))
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await leaveChatAction(chatId);
      if (!r.ok) {
        setError(r.error ?? "나가기 실패");
        alert(r.error ?? "나가기 실패");
        return;
      }
      router.push("/chat");
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      title={error ?? t("chat.leaveTitle")}
      className="text-xs rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50 shrink-0"
    >
      {isPending ? t("chat.leaving") : `🚪 ${t("chat.leave")}`}
    </button>
  );
}

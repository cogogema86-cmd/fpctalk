"use client";

/**
 * AI 자동 응답 모드 토글 — 관리자(role.isAdmin) 전용.
 * 켜진 채팅방에서는 질문형 메시지(?로 끝나거나 의문사 포함)에 AI가 자동 응답함.
 */

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setChatAiAutoReplyAction } from "../actions";
import { useT } from "@/lib/i18n/client";

export function AiAutoReplyToggle({
  chatId,
  initialEnabled,
}: {
  chatId: string;
  initialEnabled: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticEnabled, setOptimistic] = useOptimistic(initialEnabled);

  const onClick = () => {
    const next = !optimisticEnabled;
    startTransition(async () => {
      setOptimistic(next);
      const r = await setChatAiAutoReplyAction(chatId, next);
      if (!r.ok) {
        alert(r.error ?? "변경 실패");
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
      title={t("chat.aiAutoReply.title")}
      className={`text-xs rounded-md border px-2 py-1 disabled:opacity-50 shrink-0 ${
        optimisticEnabled
          ? "border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
          : "border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900"
      }`}
    >
      {isPending
        ? t("chat.aiAutoReply.toggling")
        : optimisticEnabled
          ? t("chat.aiAutoReply.on")
          : t("chat.aiAutoReply.off")}
    </button>
  );
}

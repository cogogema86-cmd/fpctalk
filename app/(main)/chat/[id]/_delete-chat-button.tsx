"use client";

/**
 * 채팅방 영구 삭제 버튼 — 관리자(role.isAdmin) 전용.
 *
 * 일반 직원의 '방 나가기'와 별개:
 *  - leaveChatAction: 본인만 멤버에서 빠짐 (다른 멤버에게는 그대로 보임)
 *  - deleteChatAction: 채팅방 자체 삭제 → 모든 멤버에서 사라짐 (관리자만 가능)
 *
 * 레벨 자동 공개 채팅도 admin이면 이걸로 정리 가능.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteChatAction } from "../actions";
import { useT } from "@/lib/i18n/client";

export function DeleteChatButton({ chatId }: { chatId: string }) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    if (!confirm(t("chat.deleteRoomConfirm"))) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteChatAction(chatId);
      if (!r.ok) {
        setError(r.error ?? "삭제 실패");
        alert(r.error ?? "삭제 실패");
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
      title={error ?? t("chat.deleteRoomTitle")}
      className="text-xs rounded-md border border-red-300 dark:border-red-900/60 text-red-600 dark:text-red-400 px-2 py-1 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 shrink-0"
    >
      {isPending ? t("chat.deletingRoom") : `🗑 ${t("chat.deleteRoom")}`}
    </button>
  );
}

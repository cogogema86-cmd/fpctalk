"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStaffActiveAction } from "../actions";

/**
 * 직원 비활성화 / 재활성화 토글 (관리자 직원 목록·편집용).
 * 비활성화 시 로그인 차단 + 선택 목록에서 숨김. 데이터는 보존되며 언제든 복구 가능.
 */
export function ActiveToggle({
  userId,
  name,
  active,
}: {
  userId: string;
  name: string;
  active: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    const next = !active;
    const msg = next
      ? `${name} 님을 다시 활성화할까요? (로그인·선택 목록 노출 복구)`
      : `${name} 님을 비활성화할까요?\n\n로그인이 차단되고 직원/채팅 선택 목록에서 숨겨집니다. 메시지·근태·사인 기록은 모두 보존되며 언제든 다시 활성화할 수 있습니다.`;
    if (!confirm(msg)) return;
    setError(null);
    startTransition(async () => {
      const r = await setStaffActiveAction(userId, next);
      if (!r.ok) {
        setError(r.error ?? "처리 실패");
        return;
      }
      router.refresh();
    });
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        className={`text-xs hover:underline disabled:opacity-50 ${
          active
            ? "text-red-600 dark:text-red-400"
            : "text-emerald-600 dark:text-emerald-400"
        }`}
      >
        {isPending ? "처리 중..." : active ? "비활성화" : "재활성화"}
      </button>
      {error && <span className="text-[10px] text-red-500">{error}</span>}
    </span>
  );
}

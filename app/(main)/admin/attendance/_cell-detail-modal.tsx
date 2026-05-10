"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteLeaveByAdminAction,
  updateLeaveNoteByAdminAction,
} from "@/app/(main)/attendance/actions";

type CellDetail = {
  leaveId: string;
  userName: string;
  type: string;
  startDate: string; // ISO
  endDate: string;
  days: number;
  reason: string | null;
};

const TYPE_BADGE: Record<string, string> = {
  ANNUAL: "연차",
  HALF_AM: "오전반차",
  HALF_PM: "오후반차",
  SICK: "병가",
  OFFICIAL: "공가",
  OTHER: "기타",
};

export function CellDetailModal({
  cell,
  onClose,
}: {
  cell: CellDetail;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState(cell.reason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const dateFmt = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  const startStr = dateFmt.format(new Date(cell.startDate));
  const endStr = dateFmt.format(new Date(cell.endDate));
  const dateRange =
    new Date(cell.startDate).toDateString() ===
    new Date(cell.endDate).toDateString()
      ? startStr
      : `${startStr} ~ ${endStr}`;

  const isDirty = (cell.reason ?? "") !== reason;

  const handleSave = () => {
    setError(null);
    setSavedFlash(false);
    startTransition(async () => {
      const r = await updateLeaveNoteByAdminAction(cell.leaveId, reason);
      if (!r.ok) {
        setError(r.error ?? "저장 실패");
        return;
      }
      setSavedFlash(true);
      router.refresh();
      setTimeout(() => setSavedFlash(false), 1500);
    });
  };

  const handleDelete = () => {
    if (
      !confirm(
        `${cell.userName} · ${TYPE_BADGE[cell.type] ?? cell.type} (${dateRange}) 휴가를 삭제하시겠습니까?\n\n승인된 연차는 사용 일수가 자동 보정됩니다.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await deleteLeaveByAdminAction(cell.leaveId);
      if (!r.ok) {
        setError(r.error ?? "삭제 실패");
        return;
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={() => !isPending && onClose()}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold">{cell.userName}</h3>
            <span className="text-xs rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 font-medium">
              {TYPE_BADGE[cell.type] ?? cell.type}
            </span>
            <span className="text-xs text-zinc-500">· {cell.days}일</span>
          </div>
          <div className="text-xs text-zinc-500 mt-1">📅 {dateRange}</div>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">
              메모 / 사유
              <span className="text-zinc-400 ml-1 font-normal">
                (자세한 내용을 적어두세요)
              </span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isPending}
              rows={6}
              maxLength={2000}
              placeholder="예: 가족 결혼식 참석 / 정기 검진 / 자녀 입학식 / 외부 연수 등"
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm resize-y"
            />
            <div className="text-[10px] text-zinc-400 mt-0.5 text-right">
              {reason.length} / 2000
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
          {savedFlash && (
            <div className="text-xs text-emerald-700 dark:text-emerald-300">
              ✓ 메모가 저장되었습니다
            </div>
          )}

          <p className="text-[11px] text-zinc-500">
            ※ 휴가 종류·기간을 변경하려면 삭제 후 새로 등록해주세요. 메모만
            여기서 갱신됩니다.
          </p>
        </div>

        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-between gap-2 bg-zinc-50 dark:bg-zinc-950 rounded-b-lg">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-md border border-red-300 dark:border-red-800 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
          >
            🗑 삭제
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !isDirty}
              className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-1.5 disabled:opacity-50"
            >
              {isPending ? "저장 중..." : "메모 저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

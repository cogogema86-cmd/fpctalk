"use client";

import { useTransition, useState } from "react";
import { cancelLeaveAction } from "./actions";
import type { LeaveStatus, LeaveType } from "@prisma/client";

type LeaveItem = {
  id: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  status: LeaveStatus;
  reason: string | null;
  decidedNote: string | null;
  decidedAt: string | null;
  approver: { name: string } | null;
  createdAt: string;
};

const TYPE_LABEL: Record<LeaveType, string> = {
  ANNUAL: "연차",
  HALF_AM: "오전반차",
  HALF_PM: "오후반차",
  SICK: "병가",
  OFFICIAL: "공가",
  OTHER: "기타",
};

const STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인됨",
  REJECTED: "거부됨",
  CANCELLED: "취소됨",
};

const STATUS_STYLE: Record<LeaveStatus, string> = {
  PENDING:
    "bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200",
  APPROVED:
    "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200",
  REJECTED: "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200",
  CANCELLED:
    "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
};

export function LeaveList({ items }: { items: LeaveItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center text-sm text-zinc-500">
        아직 신청한 휴가가 없습니다.
      </div>
    );
  }

  return (
    <ul className="rounded-md border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
      {items.map((it) => (
        <Row key={it.id} item={it} />
      ))}
    </ul>
  );
}

function Row({ item }: { item: LeaveItem }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleCancel = () => {
    if (!confirm("이 신청을 취소하시겠습니까?")) return;
    setError(null);
    startTransition(async () => {
      const r = await cancelLeaveAction(item.id);
      if (r.error) setError(r.error);
    });
  };

  const fmt = (s: string) =>
    new Date(s).toLocaleDateString("ko-KR", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    });

  const sameDay = item.startDate === item.endDate;

  return (
    <li className="px-4 py-3 text-sm bg-white dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="font-medium">{TYPE_LABEL[item.type]}</span>
            <span
              className={`text-xs rounded px-1.5 py-0.5 ${STATUS_STYLE[item.status]}`}
            >
              {STATUS_LABEL[item.status]}
            </span>
          </div>
          <div className="text-zinc-600 dark:text-zinc-400">
            {sameDay ? fmt(item.startDate) : `${fmt(item.startDate)} ~ ${fmt(item.endDate)}`}
          </div>
          {item.reason && (
            <div className="text-xs text-zinc-500 mt-1">사유: {item.reason}</div>
          )}
          {item.decidedNote && (
            <div className="text-xs text-zinc-500 mt-1">
              관리자 메모: {item.decidedNote}
            </div>
          )}
          {item.approver && item.decidedAt && (
            <div className="text-xs text-zinc-400 mt-1">
              {fmt(item.decidedAt)} · {item.approver.name}
            </div>
          )}
        </div>
        {item.status === "PENDING" && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={isPending}
            className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50 shrink-0"
          >
            {isPending ? "..." : "취소"}
          </button>
        )}
      </div>
      {error && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</div>
      )}
    </li>
  );
}

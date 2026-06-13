"use client";

import { useState, useTransition } from "react";
import { approveLeaveAction, rejectLeaveAction } from "./actions";
import type { LeaveType } from "@prisma/client";

const TYPE_LABEL: Record<LeaveType, string> = {
  ANNUAL: "연차",
  HALF_AM: "오전반차",
  HALF_PM: "오후반차",
  SICK: "병가",
  OFFICIAL: "공가",
  OTHER: "기타",
  ABSENT: "결근",
  TARDY: "지각",
  EARLY_LEAVE: "조퇴",
};

type Item = {
  id: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string | null;
  createdAt: string;
  days: number;
  requester: {
    name: string;
    username: string;
    role: { label: string };
  };
};

export function PendingRow({ item }: { item: Item }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  const handleApprove = () => {
    if (!confirm(`${item.requester.name}님의 ${TYPE_LABEL[item.type]} ${item.days}일 신청을 승인하시겠습니까?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await approveLeaveAction(item.id);
      if (r.error) setError(r.error);
    });
  };

  const handleReject = () => {
    setError(null);
    startTransition(async () => {
      const r = await rejectLeaveAction(item.id, rejectNote);
      if (r.error) setError(r.error);
      else {
        setShowReject(false);
        setRejectNote("");
      }
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
    <li className="px-4 py-3 bg-white dark:bg-zinc-950 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{item.requester.name}</span>
            <span className="text-xs text-zinc-500">
              ({item.requester.username} · {item.requester.role.label})
            </span>
          </div>
          <div className="text-sm">
            <span className="font-medium">{TYPE_LABEL[item.type]}</span>
            <span className="text-zinc-500"> · {item.days}일</span>
          </div>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            {sameDay
              ? fmt(item.startDate)
              : `${fmt(item.startDate)} ~ ${fmt(item.endDate)}`}
          </div>
          {item.reason && (
            <div className="text-xs text-zinc-500">사유: {item.reason}</div>
          )}
          <div className="text-xs text-zinc-400">
            신청일 {new Date(item.createdAt).toLocaleString("ko-KR")}
          </div>
        </div>

        {!showReject && (
          <div className="flex flex-col gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleApprove}
              disabled={isPending}
              className="text-xs rounded-md bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 font-medium disabled:opacity-50"
            >
              {isPending ? "처리중" : "승인"}
            </button>
            <button
              type="button"
              onClick={() => setShowReject(true)}
              disabled={isPending}
              className="text-xs rounded-md bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 font-medium disabled:opacity-50"
            >
              거부
            </button>
          </div>
        )}
      </div>

      {showReject && (
        <div className="space-y-2 rounded-md bg-zinc-50 dark:bg-zinc-900 p-3">
          <label className="text-xs font-medium">거부 사유 (선택)</label>
          <textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={2}
            disabled={isPending}
            placeholder="예: 해당 기간 인원 부족, 다른 일정과 겹침 등"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReject}
              disabled={isPending}
              className="text-xs rounded-md bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 font-medium disabled:opacity-50"
            >
              {isPending ? "처리중" : "거부 확정"}
            </button>
            <button
              type="button"
              onClick={() => setShowReject(false)}
              disabled={isPending}
              className="text-xs rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
      )}
    </li>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustLeaveAction } from "../../actions";

type Adjustment = {
  id: string;
  field: "TOTAL" | "USED";
  before: number;
  after: number;
  reason: string;
  createdAt: string;
  adminName: string;
};

const FIELD_LABEL: Record<"TOTAL" | "USED", string> = {
  TOTAL: "연차 한도",
  USED: "사용한 연차",
};

export function LeaveAdjustPanel({
  userId,
  annualLeaveTotal,
  annualLeaveUsed,
  reservedDays,
  adjustments,
}: {
  userId: string;
  annualLeaveTotal: number;
  annualLeaveUsed: number;
  reservedDays: number;
  adjustments: Adjustment[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [field, setField] = useState<"TOTAL" | "USED">("USED");
  const [newValue, setNewValue] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const remaining = annualLeaveTotal - annualLeaveUsed - reservedDays;
  const currentValue = field === "TOTAL" ? annualLeaveTotal : annualLeaveUsed;

  const submit = () => {
    setError(null);
    const v = Number(newValue);
    if (!Number.isFinite(v)) {
      setError("숫자를 입력해주세요.");
      return;
    }
    if (!reason.trim()) {
      setError("변경 사유를 입력해주세요.");
      return;
    }
    startTransition(async () => {
      const r = await adjustLeaveAction(userId, field, v, reason);
      if (!r.ok) {
        setError(r.error ?? "변경에 실패했습니다.");
        return;
      }
      setNewValue("");
      setReason("");
      router.refresh();
    });
  };

  return (
    <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 p-4 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-amber-900 dark:text-amber-100">
          📋 연차 잔여 조정
        </h2>
        <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
          이월·정산·입사일 보정 등 운영 중 잔여 연차를 직접 조정합니다. 변경
          내역은 자동 기록됩니다.
        </p>
      </div>

      {/* 현재 상태 */}
      <div className="grid grid-cols-3 gap-2 text-sm">
        <Stat label="한도" value={annualLeaveTotal} />
        <Stat label="사용" value={annualLeaveUsed} />
        <Stat label="잔여" value={remaining} highlight />
      </div>
      {reservedDays > 0 && (
        <div className="text-[11px] text-amber-700 dark:text-amber-400">
          ※ 잔여 = 한도 − 사용 − 예약중인 PENDING 신청 ({reservedDays}일)
        </div>
      )}

      {/* 조정 폼 */}
      <div className="space-y-2 border-t border-amber-200 dark:border-amber-900 pt-3">
        <div className="flex gap-2 items-center text-sm">
          <select
            value={field}
            onChange={(e) => setField(e.target.value as "TOTAL" | "USED")}
            disabled={isPending}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-sm"
          >
            <option value="USED">사용한 연차 (annualLeaveUsed)</option>
            <option value="TOTAL">연차 한도 (annualLeaveTotal)</option>
          </select>
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            현재: <b>{currentValue}</b>
          </span>
        </div>
        <input
          type="number"
          step="0.5"
          min="0"
          max="365"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder={`새 ${FIELD_LABEL[field]} 값 (반차 0.5 단위)`}
          disabled={isPending}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="변경 사유 (예: 2026년 이월 +2일, 4월 결근 -1일, 입사일 보정)"
          disabled={isPending}
          maxLength={500}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
        />
        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !newValue || !reason.trim()}
            className="rounded-md bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
          >
            {isPending ? "저장 중..." : "조정 저장"}
          </button>
        </div>
      </div>

      {/* 최근 조정 이력 */}
      {adjustments.length > 0 && (
        <div className="border-t border-amber-200 dark:border-amber-900 pt-3">
          <div className="text-xs font-semibold text-amber-900 dark:text-amber-100 mb-1.5">
            최근 변경 이력
          </div>
          <ul className="space-y-1 text-[11px] text-zinc-700 dark:text-zinc-300">
            {adjustments.map((a) => (
              <li
                key={a.id}
                className="flex items-baseline gap-2 border-b border-amber-100 dark:border-amber-900/60 pb-1 last:border-b-0 last:pb-0"
              >
                <span className="text-zinc-500 shrink-0">
                  {new Date(a.createdAt).toLocaleString("ko-KR", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="font-medium text-amber-800 dark:text-amber-300 shrink-0">
                  {FIELD_LABEL[a.field]}
                </span>
                <span className="font-mono shrink-0">
                  {a.before} → {a.after}
                </span>
                <span className="text-zinc-500 truncate flex-1" title={a.reason}>
                  · {a.reason} ({a.adminName})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 text-center ${
        highlight
          ? "border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40"
          : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
      }`}
    >
      <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{label}</div>
      <div
        className={`text-lg font-bold ${
          highlight
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {value}
        <span className="text-xs font-normal text-zinc-500"> 일</span>
      </div>
    </div>
  );
}

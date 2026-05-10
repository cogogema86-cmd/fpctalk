"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addLeaveByAdminAction } from "@/app/(main)/attendance/actions";
import type { LeaveType } from "@prisma/client";
import { BulkAddModal } from "./_bulk-add-modal";
import { CellDetailModal } from "./_cell-detail-modal";

type Cell = {
  leaveId: string;
  type: string;
  isFullDay: boolean;
  days: number;
  reason: string | null;
  startDate: string;
  endDate: string;
};

type UserRow = {
  id: string;
  name: string;
  username: string;
  roleLabel: string;
  joinDate: string | null;
  annualLeaveTotal: number;
  annualLeaveUsed: number;
  cells: Record<number, Cell>;
};

const TYPE_BADGE: Record<string, string> = {
  ANNUAL: "연차",
  HALF_AM: "오전",
  HALF_PM: "오후",
  SICK: "병가",
  OFFICIAL: "공가",
  OTHER: "기타",
};
const TYPE_COLOR: Record<string, string> = {
  ANNUAL: "bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200",
  HALF_AM: "bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-200",
  HALF_PM: "bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-200",
  SICK: "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200",
  OFFICIAL: "bg-violet-100 dark:bg-violet-950/60 text-violet-800 dark:text-violet-200",
  OTHER: "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
};

const SELECTABLE_TYPES: { value: LeaveType; label: string }[] = [
  { value: "ANNUAL", label: "연차 (1일)" },
  { value: "HALF_AM", label: "오전반차 (0.5일)" },
  { value: "HALF_PM", label: "오후반차 (0.5일)" },
  { value: "SICK", label: "병가" },
  { value: "OFFICIAL", label: "공가" },
  { value: "OTHER", label: "기타" },
];

export function AttendanceGrid({
  year,
  monthIdx,
  daysInMonth,
  users,
}: {
  year: number;
  monthIdx: number;
  daysInMonth: number;
  users: UserRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [picker, setPicker] = useState<{
    userId: string;
    userName: string;
    day: number;
  } | null>(null);
  const [pickerType, setPickerType] = useState<LeaveType>("ANNUAL");
  const [error, setError] = useState<string | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [detail, setDetail] = useState<{
    leaveId: string;
    userName: string;
    type: string;
    startDate: string;
    endDate: string;
    days: number;
    reason: string | null;
  } | null>(null);

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthStr = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;

  // 일별 요일
  const dayOfWeek = (d: number) => new Date(year, monthIdx, d).getDay();

  const computeStats = (cells: Record<number, Cell>) => {
    let halfDays = 0;
    let fullAnnualDays = 0;
    let other = 0;
    const seen = new Set<string>();
    for (const c of Object.values(cells)) {
      if (seen.has(c.leaveId)) continue;
      seen.add(c.leaveId);
      if (c.type === "HALF_AM" || c.type === "HALF_PM") halfDays += 1;
      else if (c.type === "ANNUAL") fullAnnualDays += c.days;
      else other += c.days;
    }
    const deductible = fullAnnualDays + halfDays * 0.5;
    return { halfDays, fullAnnualDays, other, deductible };
  };

  const handleCellClick = (
    userId: string,
    userName: string,
    day: number,
    cell: Cell | undefined,
  ) => {
    setError(null);
    if (cell) {
      // 채워진 셀 → 상세/메모 modal (사유 작성 + 삭제 가능)
      setDetail({
        leaveId: cell.leaveId,
        userName,
        type: cell.type,
        startDate: cell.startDate,
        endDate: cell.endDate,
        days: cell.days,
        reason: cell.reason,
      });
    } else {
      // 빈 셀 → 휴가 등록 picker
      setPickerType("ANNUAL");
      setPicker({ userId, userName, day });
    }
  };

  const submitPicker = () => {
    if (!picker) return;
    setError(null);
    const dayStr = `${monthStr}-${String(picker.day).padStart(2, "0")}`;
    startTransition(async () => {
      const r = await addLeaveByAdminAction({
        userId: picker.userId,
        type: pickerType,
        startDate: dayStr,
        endDate: dayStr,
      });
      if (!r.ok) {
        setError(r.error ?? "등록 실패");
        return;
      }
      setPicker(null);
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setShowBulk(true)}
          className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-1.5 shadow-sm"
        >
          ＋ 일괄 등록
        </button>
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <thead className="bg-zinc-50 dark:bg-zinc-900 sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 bg-zinc-50 dark:bg-zinc-900 border-r border-b border-zinc-200 dark:border-zinc-800 px-3 py-2 text-left font-medium min-w-[8rem] z-20">
                직원
              </th>
              <th className="border-r border-b border-zinc-200 dark:border-zinc-800 px-2 py-2 font-medium whitespace-nowrap">
                입사일
              </th>
              {days.map((d) => {
                const dow = dayOfWeek(d);
                return (
                  <th
                    key={d}
                    className={`border-r border-b border-zinc-200 dark:border-zinc-800 px-1 py-2 font-medium min-w-[2rem] ${
                      dow === 0
                        ? "text-red-500"
                        : dow === 6
                          ? "text-blue-500"
                          : ""
                    }`}
                  >
                    {d}
                  </th>
                );
              })}
              <th className="border-r border-b border-zinc-200 dark:border-zinc-800 px-2 py-2 font-medium whitespace-nowrap">
                반차
              </th>
              <th className="border-r border-b border-zinc-200 dark:border-zinc-800 px-2 py-2 font-medium whitespace-nowrap">
                연차
              </th>
              <th className="border-r border-b border-zinc-200 dark:border-zinc-800 px-2 py-2 font-medium whitespace-nowrap">
                차감일
              </th>
              <th className="border-b border-zinc-200 dark:border-zinc-800 px-2 py-2 font-medium whitespace-nowrap">
                잔여
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const stats = computeStats(u.cells);
              const remaining = u.annualLeaveTotal - u.annualLeaveUsed;
              return (
                <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="sticky left-0 bg-white dark:bg-zinc-950 border-r border-b border-zinc-200 dark:border-zinc-800 px-3 py-1.5 z-10">
                    <div className="font-medium truncate">{u.name}</div>
                    <div className="text-[10px] text-zinc-500 truncate">
                      {u.roleLabel}
                    </div>
                  </td>
                  <td className="border-r border-b border-zinc-200 dark:border-zinc-800 px-2 py-1.5 text-zinc-500 text-[10px] whitespace-nowrap">
                    {u.joinDate ?? "-"}
                  </td>
                  {days.map((d) => {
                    const cell = u.cells[d];
                    const dow = dayOfWeek(d);
                    return (
                      <td
                        key={d}
                        className={`border-r border-b border-zinc-200 dark:border-zinc-800 p-0 align-middle ${
                          dow === 0 || dow === 6
                            ? "bg-zinc-50/40 dark:bg-zinc-900/20"
                            : ""
                        }`}
                      >
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleCellClick(u.id, u.name, d, cell)}
                          className={`w-full h-7 text-center transition-colors disabled:opacity-50 ${
                            cell
                              ? `${TYPE_COLOR[cell.type] ?? ""} font-medium`
                              : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-300 dark:text-zinc-700"
                          }`}
                          title={
                            cell
                              ? `${TYPE_BADGE[cell.type] ?? cell.type}${
                                  cell.reason ? ` — ${cell.reason}` : ""
                                } (클릭하여 메모/삭제)`
                              : "클릭하여 휴가 등록"
                          }
                        >
                          {cell ? TYPE_BADGE[cell.type] ?? "·" : "·"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="border-r border-b border-zinc-200 dark:border-zinc-800 px-2 py-1.5 text-center font-mono">
                    {stats.halfDays || ""}
                  </td>
                  <td className="border-r border-b border-zinc-200 dark:border-zinc-800 px-2 py-1.5 text-center font-mono">
                    {stats.fullAnnualDays || ""}
                  </td>
                  <td className="border-r border-b border-zinc-200 dark:border-zinc-800 px-2 py-1.5 text-center font-mono">
                    {stats.deductible.toFixed(1)}
                  </td>
                  <td
                    className={`border-b border-zinc-200 dark:border-zinc-800 px-2 py-1.5 text-center font-mono font-semibold ${
                      remaining <= 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-emerald-700 dark:text-emerald-300"
                    }`}
                  >
                    {remaining}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-2 text-[11px] mt-3">
        {Object.entries(TYPE_BADGE).map(([k, v]) => (
          <span
            key={k}
            className={`rounded px-1.5 py-0.5 ${TYPE_COLOR[k] ?? ""}`}
          >
            {v}
          </span>
        ))}
      </div>

      {/* 셀 상세/메모 modal (채워진 셀 클릭 시) */}
      {detail && (
        <CellDetailModal
          cell={detail}
          onClose={() => setDetail(null)}
        />
      )}

      {/* 일괄 등록 modal */}
      {showBulk && (
        <BulkAddModal
          users={users.map((u) => ({
            id: u.id,
            name: u.name,
            username: u.username,
            roleLabel: u.roleLabel,
          }))}
          defaultStartDate={`${year}-${String(monthIdx + 1).padStart(2, "0")}-01`}
          onClose={() => setShowBulk(false)}
        />
      )}

      {/* 단일 셀 휴가 등록 modal */}
      {picker && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => !isPending && setPicker(null)}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-sm w-full p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-semibold">휴가 직접 등록</h3>
              <p className="text-xs text-zinc-500 mt-1">
                {picker.userName} · {monthIdx + 1}월 {picker.day}일
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                휴가 종류
              </label>
              <select
                value={pickerType}
                onChange={(e) => setPickerType(e.target.value as LeaveType)}
                disabled={isPending}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
              >
                {SELECTABLE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-zinc-500">
                연차/반차는 사용 일수에 자동 차감되며, LeaveAdjustment 감사 로그가 남습니다.
              </p>
            </div>
            {error && (
              <div className="text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPicker(null)}
                disabled={isPending}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitPicker}
                disabled={isPending}
                className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-1.5 disabled:opacity-50"
              >
                {isPending ? "등록 중..." : "등록"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

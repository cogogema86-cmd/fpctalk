"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { addLeavesBulkByAdminAction } from "@/app/(main)/attendance/actions";
import type { LeaveType } from "@prisma/client";

type UserOption = {
  id: string;
  name: string;
  username: string;
  roleLabel: string;
};

const TYPES: { value: LeaveType; label: string; isHalf: boolean }[] = [
  { value: "ANNUAL", label: "연차 (1일)", isHalf: false },
  { value: "HALF_AM", label: "오전반차 (0.5일)", isHalf: true },
  { value: "HALF_PM", label: "오후반차 (0.5일)", isHalf: true },
  { value: "SICK", label: "병가", isHalf: false },
  { value: "OFFICIAL", label: "공가", isHalf: false },
  { value: "OTHER", label: "기타", isHalf: false },
];

export function BulkAddModal({
  users,
  defaultStartDate,
  onClose,
}: {
  users: UserOption[];
  defaultStartDate: string; // YYYY-MM-DD
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [type, setType] = useState<LeaveType>("ANNUAL");
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultStartDate);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const isHalf = type === "HALF_AM" || type === "HALF_PM";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.roleLabel.toLowerCase().includes(q),
    );
  }, [users, search]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((u) => selectedIds.has(u.id));

  const toggleAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const u of filtered) next.delete(u.id);
      } else {
        for (const u of filtered) next.add(u.id);
      }
      return next;
    });
  };

  const submit = () => {
    setError(null);
    setResultMsg(null);
    if (selectedIds.size === 0) {
      setError("직원을 1명 이상 선택해주세요.");
      return;
    }
    if (!startDate) {
      setError("시작일을 선택해주세요.");
      return;
    }
    if (!isHalf && !endDate) {
      setError("종료일을 선택해주세요.");
      return;
    }
    startTransition(async () => {
      const r = await addLeavesBulkByAdminAction({
        userIds: Array.from(selectedIds),
        type,
        startDate,
        endDate: isHalf ? startDate : endDate,
        reason: reason || undefined,
      });
      if (!r.ok) {
        setError(r.error ?? "등록 실패");
        return;
      }
      const failedCount = r.failed?.length ?? 0;
      if (failedCount === 0) {
        setResultMsg(`${r.created}명 등록 완료`);
        router.refresh();
        // 잠깐 결과 보여준 뒤 닫기
        setTimeout(() => onClose(), 800);
      } else {
        setResultMsg(
          `성공 ${r.created}명, 실패 ${failedCount}명. 실패 사유: ${r.failed
            ?.slice(0, 3)
            .map((f) => f.reason)
            .join(" / ")}`,
        );
        router.refresh();
      }
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={() => !isPending && onClose()}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="text-lg font-semibold">📋 휴가 일괄 등록</h3>
          <p className="text-xs text-zinc-500 mt-1">
            여러 직원 × 여러 날짜를 한 번에 등록합니다. 차감 대상은 자동
            보정됩니다.
          </p>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* 휴가 종류 + 기간 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">
                휴가 종류
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as LeaveType)}
                disabled={isPending}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">시작일</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={isPending}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                종료일{" "}
                {isHalf && (
                  <span className="text-zinc-400">(반차는 같은 날)</span>
                )}
              </label>
              <input
                type="date"
                value={isHalf ? startDate : endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={isPending || isHalf}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm disabled:opacity-50"
              />
            </div>
          </div>

          {/* 사유 */}
          <div>
            <label className="block text-xs font-medium mb-1">
              사유 (선택)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isPending}
              maxLength={200}
              placeholder="예: 학원 휴원, 워크숍, 단체 연수"
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
            />
          </div>

          {/* 직원 선택 */}
          <div>
            <div className="flex items-center justify-between mb-2 gap-2">
              <label className="text-xs font-medium">
                직원 선택{" "}
                <span className="text-blue-600 dark:text-blue-400 font-semibold">
                  ({selectedIds.size})
                </span>
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="검색..."
                className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs w-32"
              />
            </div>

            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 max-h-64 overflow-y-auto">
              <button
                type="button"
                onClick={toggleAllFiltered}
                className="w-full text-left px-3 py-1.5 text-xs font-medium border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 sticky top-0"
              >
                {allFilteredSelected
                  ? `□ 검색 결과 모두 해제 (${filtered.length})`
                  : `☐ 검색 결과 모두 선택 (${filtered.length})`}
              </button>
              <ul>
                {filtered.map((u) => {
                  const checked = selectedIds.has(u.id);
                  return (
                    <li key={u.id}>
                      <label
                        className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                          checked ? "bg-blue-50 dark:bg-blue-950/30" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(u.id)}
                          className="shrink-0"
                        />
                        <span className="flex-1 truncate">{u.name}</span>
                        <span className="text-xs text-zinc-500 truncate">
                          {u.roleLabel} · {u.username}
                        </span>
                      </label>
                    </li>
                  );
                })}
                {filtered.length === 0 && (
                  <li className="px-3 py-4 text-center text-xs text-zinc-500">
                    검색 결과가 없습니다.
                  </li>
                )}
              </ul>
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
          {resultMsg && (
            <div className="text-xs text-emerald-700 dark:text-emerald-300">
              {resultMsg}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2 bg-zinc-50 dark:bg-zinc-950 rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || selectedIds.size === 0}
            className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-1.5 disabled:opacity-50"
          >
            {isPending
              ? "등록 중..."
              : `${selectedIds.size}명 등록`}
          </button>
        </div>
      </div>
    </div>
  );
}

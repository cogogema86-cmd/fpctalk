import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import {
  calcLeaveDays,
  getPendingLeaveRequests,
  getRecentLeaveRequests,
} from "@/lib/attendance";
import { PendingRow } from "./_pending-row";
import type { LeaveStatus, LeaveType } from "@prisma/client";

const TYPE_LABEL: Record<LeaveType, string> = {
  ANNUAL: "연차",
  HALF_AM: "오전반차",
  HALF_PM: "오후반차",
  SICK: "병가",
  OFFICIAL: "공가",
  OTHER: "기타",
};

const STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "거부",
  CANCELLED: "취소",
};

const STATUS_STYLE: Record<LeaveStatus, string> = {
  PENDING: "bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200",
  APPROVED: "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200",
  REJECTED: "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200",
  CANCELLED: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
};

export default async function AdminLeavePage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { authId: authUser.id },
    include: { role: true },
  });
  if (!me || !me.role.isAdmin) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        관리자 전용 페이지입니다.
      </div>
    );
  }

  const pending = await getPendingLeaveRequests();
  const recent = await getRecentLeaveRequests(30);

  const pendingItems = pending.map((r) => ({
    id: r.id,
    type: r.type,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    days: calcLeaveDays(r.type, r.startDate, r.endDate),
    requester: {
      name: r.requester.name,
      username: r.requester.username,
      role: { label: r.requester.role.label },
    },
  }));

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          연차 / 휴가 승인
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          대기 중인 신청 {pendingItems.length}건
        </p>
      </div>

      {/* 대기 중 */}
      <section className="space-y-2">
        <h2 className="font-semibold">대기 중</h2>
        {pendingItems.length === 0 ? (
          <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center text-sm text-zinc-500">
            처리할 신청이 없습니다.
          </div>
        ) : (
          <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
            {pendingItems.map((it) => (
              <PendingRow key={it.id} item={it} />
            ))}
          </ul>
        )}
      </section>

      {/* 최근 처리 내역 */}
      <section className="space-y-2">
        <h2 className="font-semibold">최근 내역</h2>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
              <tr>
                <th className="text-left px-3 py-2 font-medium">신청자</th>
                <th className="text-left px-3 py-2 font-medium">종류</th>
                <th className="text-left px-3 py-2 font-medium">기간</th>
                <th className="text-left px-3 py-2 font-medium">상태</th>
                <th className="text-left px-3 py-2 font-medium">처리</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-sm text-zinc-400"
                  >
                    아직 처리 내역이 없습니다.
                  </td>
                </tr>
              )}
              {recent.map((r) => {
                const sameDay =
                  r.startDate.toDateString() === r.endDate.toDateString();
                const fmt = (d: Date) =>
                  d.toLocaleDateString("ko-KR", {
                    year: "2-digit",
                    month: "2-digit",
                    day: "2-digit",
                  });
                return (
                  <tr
                    key={r.id}
                    className="border-t border-zinc-200 dark:border-zinc-800"
                  >
                    <td className="px-3 py-2">
                      {r.requester.name}
                      <span className="ml-1 text-xs text-zinc-500">
                        ({r.requester.role.label})
                      </span>
                    </td>
                    <td className="px-3 py-2">{TYPE_LABEL[r.type]}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {sameDay
                        ? fmt(r.startDate)
                        : `${fmt(r.startDate)} ~ ${fmt(r.endDate)}`}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs rounded px-1.5 py-0.5 ${STATUS_STYLE[r.status]}`}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-500">
                      {r.approver?.name ?? "—"}
                      {r.decidedAt && (
                        <div className="text-zinc-400">
                          {fmt(r.decidedAt)}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";
import {
  calcLeaveDays,
  dayKey,
  getMonthlyAttendance,
  getMyLeaveRequests,
  getTodayAttendance,
} from "@/lib/attendance";
import { CheckCard } from "./_check-card";
import { MonthCalendar } from "./_calendar";
import { LeaveForm } from "./_leave-form";
import { LeaveList } from "./_leave-list";

export default async function AttendancePage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const today = await getTodayAttendance(me.id);
  const checkInRow = today.find((a) => a.type === "CHECK_IN");
  const checkOutRow = today.find((a) => a.type === "CHECK_OUT");

  const now = new Date();
  const year = now.getFullYear();
  const monthIdx = now.getMonth();
  const monthly = await getMonthlyAttendance(me.id, year, monthIdx);

  // byDay 빌드
  const byDay: Record<string, { in: string | null; out: string | null }> = {};
  for (const a of monthly) {
    const k = dayKey(a.at);
    if (!byDay[k]) byDay[k] = { in: null, out: null };
    if (a.type === "CHECK_IN") byDay[k].in = a.at.toISOString();
    if (a.type === "CHECK_OUT") byDay[k].out = a.at.toISOString();
  }

  // 연차 정보
  const userInfo = await prisma.user.findUnique({
    where: { id: me.id },
    select: { annualLeaveTotal: true, annualLeaveUsed: true },
  });
  const reserved = await prisma.leaveRequest.findMany({
    where: {
      requesterId: me.id,
      status: { in: ["PENDING", "APPROVED"] },
      type: { in: ["ANNUAL", "HALF_AM", "HALF_PM"] },
    },
    select: { type: true, startDate: true, endDate: true },
  });
  const reservedDays = reserved.reduce(
    (s, r) => s + calcLeaveDays(r.type, r.startDate, r.endDate),
    0,
  );
  const remaining =
    (userInfo?.annualLeaveTotal ?? 0) -
    (userInfo?.annualLeaveUsed ?? 0) -
    reservedDays;

  const leaveRequests = await getMyLeaveRequests(me.id);
  const leaveItems = leaveRequests.map((r) => ({
    id: r.id,
    type: r.type,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    status: r.status,
    reason: r.reason,
    decidedNote: r.decidedNote,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    approver: r.approver ? { name: r.approver.name } : null,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          근태
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          출퇴근 체크 + 휴가 신청
        </p>
      </div>

      {/* 출퇴근 + 캘린더 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <CheckCard
            checkInTime={checkInRow?.at.toISOString() ?? null}
            checkOutTime={checkOutRow?.at.toISOString() ?? null}
          />
        </div>
        <div className="lg:col-span-2">
          <MonthCalendar year={year} monthIdx={monthIdx} byDay={byDay} />
        </div>
      </div>

      {/* 휴가 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-3">
          <h2 className="font-semibold">휴가 신청</h2>
          <LeaveForm remaining={Math.max(0, remaining)} />
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">내 휴가 내역</h2>
          <LeaveList items={leaveItems} />
        </section>
      </div>
    </div>
  );
}

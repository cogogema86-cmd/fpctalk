import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import {
  calcLeaveDays,
  dayKey,
  getMonthlyApprovedLeaves,
  getMyLeaveRequests,
} from "@/lib/attendance";
import { MonthCalendar } from "./_calendar";
import { LeaveForm } from "./_leave-form";
import { LeaveList } from "./_leave-list";
import { getLocale, getT } from "@/lib/i18n/server";

export default async function AttendancePage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { authId: authUser.id },
    include: { role: true },
  });
  if (!me) redirect("/login");

  const isAdmin = me.role.isAdmin;

  const t = await getT();
  const locale = await getLocale();

  const now = new Date();
  const year = now.getFullYear();
  const monthIdx = now.getMonth();

  // 캘린더용 휴가: 관리자=전체, 직원=본인
  const monthlyLeaves = await getMonthlyApprovedLeaves(
    year,
    monthIdx,
    isAdmin ? "all" : "mine",
    me.id,
  );

  // 일자별 휴가 매핑 — 휴가 기간 모든 날짜에 entry 추가
  const leavesByDay: Record<
    string,
    Array<{ id: string; name: string; type: string; isMine: boolean }>
  > = {};
  for (const lv of monthlyLeaves) {
    const start = new Date(
      Math.max(lv.startDate.getTime(), new Date(year, monthIdx, 1).getTime()),
    );
    const end = new Date(
      Math.min(
        lv.endDate.getTime(),
        new Date(year, monthIdx + 1, 0, 23, 59, 59, 999).getTime(),
      ),
    );
    for (
      let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      d <= end;
      d.setDate(d.getDate() + 1)
    ) {
      const k = dayKey(d);
      if (!leavesByDay[k]) leavesByDay[k] = [];
      leavesByDay[k].push({
        id: lv.id,
        name: lv.requester.name,
        type: lv.type,
        isMine: lv.requesterId === me.id,
      });
    }
  }

  // 행사: 모든 사용자가 학원 행사 다 보임 (전체 공유)
  const monthStart = new Date(year, monthIdx, 1);
  const monthEnd = new Date(year, monthIdx + 1, 0, 23, 59, 59, 999);
  const events = await prisma.event.findMany({
    where: {
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
    },
    select: { id: true, title: true, startDate: true, endDate: true },
    orderBy: { startDate: "asc" },
  });
  const eventsByDay: Record<string, Array<{ id: string; title: string }>> = {};
  for (const ev of events) {
    const start = new Date(
      Math.max(ev.startDate.getTime(), monthStart.getTime()),
    );
    const end = new Date(Math.min(ev.endDate.getTime(), monthEnd.getTime()));
    for (
      let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      d <= end;
      d.setDate(d.getDate() + 1)
    ) {
      const k = dayKey(d);
      if (!eventsByDay[k]) eventsByDay[k] = [];
      eventsByDay[k].push({ id: ev.id, title: ev.title });
    }
  }

  // 본인 연차 잔여 (휴가 신청 폼에 표시)
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

  // 본인 휴가 신청 내역
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
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          📅 {t("att.title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {isAdmin ? t("att.adminSubtitle") : t("att.staffSubtitle")}
        </p>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-blue-500" />
          {t("att.calendarLegend.mine")}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-zinc-300 dark:bg-zinc-700" />
            {t("att.calendarLegend.others")}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-amber-300" />
          {t("att.calendarLegend.event")}
        </div>
      </div>

      <MonthCalendar
        year={year}
        monthIdx={monthIdx}
        leavesByDay={leavesByDay}
        eventsByDay={eventsByDay}
        locale={locale}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-3">
          <h2 className="font-semibold">{t("att.leaveRequest")}</h2>
          <LeaveForm remaining={Math.max(0, remaining)} />
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">{t("att.myLeaves")}</h2>
          <LeaveList items={leaveItems} />
        </section>
      </div>
    </div>
  );
}

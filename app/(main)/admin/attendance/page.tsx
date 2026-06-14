import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { calcLeaveDays, getMonthlyApprovedLeaves } from "@/lib/attendance";
import { getLocale, getT } from "@/lib/i18n/server";
import { CalendarNav } from "@/app/(main)/attendance/_calendar-nav";
import { AttendanceGrid } from "./_grid";

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { authId: authUser.id },
    include: { role: true },
  });
  if (!me?.role.isAdmin || !me.role.canManageAttendance) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        근태 관리 권한이 있는 관리자만 접근할 수 있습니다.
      </div>
    );
  }

  const sp = await searchParams;
  const now = new Date();
  let year = now.getFullYear();
  let monthIdx = now.getMonth();
  if (sp.ym) {
    const m = sp.ym.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      if (y >= 2000 && y <= 2100 && mo >= 0 && mo <= 11) {
        year = y;
        monthIdx = mo;
      }
    }
  }

  const t = await getT();
  const locale = await getLocale();
  const monthStart = new Date(year, monthIdx, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, monthIdx + 1, 0, 23, 59, 59, 999);
  const daysInMonth = monthEnd.getDate();

  // 직원 + 역할 (정렬: role.sortOrder, 같으면 name) — 활성 직원만
  const users = await prisma.user.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      username: true,
      joinDate: true,
      annualLeaveTotal: true,
      annualLeaveUsed: true,
      role: { select: { label: true, sortOrder: true } },
    },
    orderBy: [{ role: { sortOrder: "asc" } }, { name: "asc" }],
  });

  // 그 달의 APPROVED 휴가 전부
  const monthLeaves = await getMonthlyApprovedLeaves(
    year,
    monthIdx,
    "all",
    me.id,
  );

  // userId × 일(1~31) 셀에 leave 매핑
  type Cell = {
    leaveId: string;
    type: string; // ANNUAL/HALF_AM/...
    isFullDay: boolean;
    days: number;
    reason: string | null;
    startDate: string; // ISO
    endDate: string;
  };
  const matrix: Record<string, Record<number, Cell>> = {};
  for (const lv of monthLeaves) {
    const startMs = Math.max(lv.startDate.getTime(), monthStart.getTime());
    const endMs = Math.min(lv.endDate.getTime(), monthEnd.getTime());
    const startD = new Date(startMs);
    const endD = new Date(endMs);
    const days = calcLeaveDays(lv.type, lv.startDate, lv.endDate);
    for (
      let d = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate());
      d <= endD;
      d.setDate(d.getDate() + 1)
    ) {
      const day = d.getDate();
      if (!matrix[lv.requesterId]) matrix[lv.requesterId] = {};
      matrix[lv.requesterId][day] = {
        leaveId: lv.id,
        type: lv.type,
        isFullDay: lv.type !== "HALF_AM" && lv.type !== "HALF_PM",
        days,
        reason: lv.reason ?? null,
        startDate: lv.startDate.toISOString(),
        endDate: lv.endDate.toISOString(),
      };
    }
  }

  // ── 이번 달 휴가 정리 (종류별 합계 + 목록) ──
  // 일수는 이 달 범위로 클램프(여러 달 걸친 휴가는 이 달 몫만), 지각/조퇴는 건수로 집계.
  const startDayMs = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const clampedDays = (lvType: string, s: Date, e: Date): number => {
    if (lvType === "HALF_AM" || lvType === "HALF_PM") return 0.5;
    const a = Math.max(startDayMs(s), startDayMs(monthStart));
    const b = Math.min(startDayMs(e), startDayMs(monthEnd));
    return Math.floor((b - a) / 86_400_000) + 1;
  };
  const COUNT_TYPES = new Set(["TARDY", "EARLY_LEAVE"]); // 건수로 표기
  const TYPE_ORDER = [
    "ANNUAL",
    "HALF_AM",
    "HALF_PM",
    "SICK",
    "OFFICIAL",
    "OTHER",
    "ABSENT",
    "TARDY",
    "EARLY_LEAVE",
  ] as const;
  const TYPE_BADGE: Record<string, string> = {
    ANNUAL: "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-200",
    HALF_AM: "bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-200",
    HALF_PM: "bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-200",
    SICK: "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-200",
    OFFICIAL: "bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-200",
    OTHER: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300",
    ABSENT: "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-200",
    TARDY: "bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-200",
    EARLY_LEAVE: "bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-200",
  };
  const byType: Record<string, { days: number; count: number }> = {};
  const summaryRows = monthLeaves.map((lv) => {
    const amount = clampedDays(lv.type, lv.startDate, lv.endDate);
    const a = byType[lv.type] ?? { days: 0, count: 0 };
    a.days += amount;
    a.count += 1;
    byType[lv.type] = a;
    return {
      id: lv.id,
      name: lv.requester.name,
      type: lv.type,
      amount,
      reason: lv.reason,
      startDate: lv.startDate,
      endDate: lv.endDate,
    };
  });
  const summaryChips = TYPE_ORDER.filter((tp) => byType[tp]).map((tp) => ({
    type: tp,
    isCount: COUNT_TYPES.has(tp),
    value: COUNT_TYPES.has(tp) ? byType[tp].count : byType[tp].days,
  }));
  const fmtMD = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  const unitDay = t("admin.attendance.summary.unitDay");
  const unitCount = t("admin.attendance.summary.unitCount");

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          📋 {t("nav.adminAttendance")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          월간 직원 근태 매트릭스 — 빈 셀 클릭으로 휴가 등록 / 채워진 셀 클릭으로 삭제
        </p>
      </div>

      {/* 월/년 navigation (캘린더와 동일 컴포넌트 재사용) */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <CalendarNav year={year} monthIdx={monthIdx} locale={locale} />
      </div>

      <AttendanceGrid
        year={year}
        monthIdx={monthIdx}
        daysInMonth={daysInMonth}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          username: u.username,
          roleLabel: u.role.label,
          joinDate: u.joinDate ? u.joinDate.toISOString().slice(0, 10) : null,
          annualLeaveTotal: u.annualLeaveTotal,
          annualLeaveUsed: u.annualLeaveUsed,
          cells: matrix[u.id] ?? {},
        }))}
      />

      {/* 이번 달 휴가 정리 */}
      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-3">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
          📊 {t("admin.attendance.summary.title")}
        </h2>

        {summaryRows.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t("admin.attendance.summary.empty")}
          </p>
        ) : (
          <>
            {/* 종류별 합계 칩 */}
            <div className="flex flex-wrap gap-2">
              {summaryChips.map((c) => (
                <span
                  key={c.type}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                    TYPE_BADGE[c.type] ?? "bg-zinc-100 dark:bg-zinc-800"
                  }`}
                >
                  {t(`leave.type.${c.type}`)}
                  <span className="font-semibold tabular-nums">
                    {c.value}
                    {c.isCount ? unitCount : unitDay}
                  </span>
                </span>
              ))}
            </div>

            {/* 상세 목록 (날짜순) */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-zinc-500 dark:text-zinc-400">
                  <tr className="text-left">
                    <th className="py-1.5 pr-3 font-medium">
                      {t("admin.attendance.summary.colPeriod")}
                    </th>
                    <th className="py-1.5 pr-3 font-medium">
                      {t("admin.attendance.summary.colStaff")}
                    </th>
                    <th className="py-1.5 pr-3 font-medium">
                      {t("admin.attendance.summary.colType")}
                    </th>
                    <th className="py-1.5 pr-3 font-medium text-right">
                      {t("admin.attendance.summary.colAmount")}
                    </th>
                    <th className="py-1.5 font-medium">
                      {t("admin.attendance.summary.colReason")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-zinc-100 dark:border-zinc-800/70"
                    >
                      <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                        {fmtMD(r.startDate) === fmtMD(r.endDate)
                          ? fmtMD(r.startDate)
                          : `${fmtMD(r.startDate)} ~ ${fmtMD(r.endDate)}`}
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap font-medium text-zinc-800 dark:text-zinc-100">
                        {r.name}
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-xs ${
                            TYPE_BADGE[r.type] ?? "bg-zinc-100 dark:bg-zinc-800"
                          }`}
                        >
                          {t(`leave.type.${r.type}`)}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums">
                        {r.amount}
                        {COUNT_TYPES.has(r.type) ? unitCount : unitDay}
                      </td>
                      <td className="py-1.5 text-zinc-500 dark:text-zinc-400">
                        {r.reason || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

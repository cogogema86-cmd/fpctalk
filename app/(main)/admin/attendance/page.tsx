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
  if (!me?.role.isAdmin) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        관리자 전용 페이지입니다.
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
    </div>
  );
}

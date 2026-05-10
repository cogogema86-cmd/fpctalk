/**
 * 월간 근태 매트릭스 엑셀 다운로드 (관리자 전용)
 * GET /api/admin/attendance/export?ym=YYYY-MM
 *
 * 시트 구성:
 * - 시트 1 "근태": 사원정보 | 입사일 | 1..31일 | 반차 | 연차 | 차감일 | 잔여
 * - 시트 2 "메모": 직원/날짜/휴가종류/사유 — 노무사가 별도 참고
 */
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";
import {
  calcLeaveDays,
  getMonthlyApprovedLeaves,
} from "@/lib/attendance";

const TYPE_LABEL: Record<string, string> = {
  ANNUAL: "연차",
  HALF_AM: "오전반차",
  HALF_PM: "오후반차",
  SICK: "병가",
  OFFICIAL: "공가",
  OTHER: "기타",
};
const TYPE_SHORT: Record<string, string> = {
  ANNUAL: "연차",
  HALF_AM: "오전",
  HALF_PM: "오후",
  SICK: "병가",
  OFFICIAL: "공가",
  OTHER: "기타",
};

export async function GET(req: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const meWithRole = await prisma.user.findUnique({
    where: { id: me.id },
    include: { role: { select: { isAdmin: true } } },
  });
  if (!meWithRole?.role.isAdmin) {
    return NextResponse.json({ error: "관리자 전용" }, { status: 403 });
  }

  const url = new URL(req.url);
  const ymParam = url.searchParams.get("ym");
  const now = new Date();
  let year = now.getFullYear();
  let monthIdx = now.getMonth();
  if (ymParam) {
    const m = ymParam.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      if (y >= 2000 && y <= 2100 && mo >= 0 && mo <= 11) {
        year = y;
        monthIdx = mo;
      }
    }
  }

  const monthStart = new Date(year, monthIdx, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, monthIdx + 1, 0, 23, 59, 59, 999);
  const daysInMonth = monthEnd.getDate();

  const users = await prisma.user.findMany({
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

  const leaves = await getMonthlyApprovedLeaves(year, monthIdx, "all", me.id);

  // 매트릭스 매핑
  type CellEx = {
    type: string;
    leaveId: string;
    reason: string | null;
  };
  const matrix: Record<string, Record<number, CellEx>> = {};
  const memoRows: Array<{
    name: string;
    date: string;
    type: string;
    reason: string;
  }> = [];

  for (const lv of leaves) {
    const startMs = Math.max(lv.startDate.getTime(), monthStart.getTime());
    const endMs = Math.min(lv.endDate.getTime(), monthEnd.getTime());
    const startD = new Date(startMs);
    const endD = new Date(endMs);
    for (
      let d = new Date(
        startD.getFullYear(),
        startD.getMonth(),
        startD.getDate(),
      );
      d <= endD;
      d.setDate(d.getDate() + 1)
    ) {
      const day = d.getDate();
      if (!matrix[lv.requesterId]) matrix[lv.requesterId] = {};
      matrix[lv.requesterId][day] = {
        type: lv.type,
        leaveId: lv.id,
        reason: lv.reason ?? null,
      };
    }
    if (lv.reason) {
      const dateStr =
        lv.startDate.toDateString() === lv.endDate.toDateString()
          ? lv.startDate.toISOString().slice(0, 10)
          : `${lv.startDate.toISOString().slice(0, 10)} ~ ${lv.endDate.toISOString().slice(0, 10)}`;
      memoRows.push({
        name: lv.requester.name,
        date: dateStr,
        type: TYPE_LABEL[lv.type] ?? lv.type,
        reason: lv.reason,
      });
    }
  }

  // 시트 1: 근태 매트릭스
  const header: (string | number)[] = [
    "사원 정보",
    "입사일자",
    ...Array.from({ length: daysInMonth }, (_v, i) => i + 1),
    "반차",
    "연차",
    "차감일",
    "잔여연차",
  ];
  const rows: (string | number)[][] = [header];

  for (const u of users) {
    const cells = matrix[u.id] ?? {};
    let halfDays = 0;
    let fullAnnual = 0;
    const seen = new Set<string>();
    for (const c of Object.values(cells)) {
      if (seen.has(c.leaveId)) continue;
      seen.add(c.leaveId);
      // 같은 leaveId라도 매트릭스에 한 번만 카운트
      // 일수 계산: 실제 LeaveRequest의 days
      const lv = leaves.find((l) => l.id === c.leaveId);
      if (!lv) continue;
      if (lv.type === "HALF_AM" || lv.type === "HALF_PM") halfDays += 1;
      else if (lv.type === "ANNUAL") fullAnnual += calcLeaveDays(lv.type, lv.startDate, lv.endDate);
    }
    const deductible = fullAnnual + halfDays * 0.5;
    const remaining = u.annualLeaveTotal - u.annualLeaveUsed;

    const row: (string | number)[] = [
      u.name,
      u.joinDate ? u.joinDate.toISOString().slice(0, 10) : "",
    ];
    for (let day = 1; day <= daysInMonth; day++) {
      const c = cells[day];
      row.push(c ? TYPE_SHORT[c.type] ?? c.type : "");
    }
    row.push(halfDays || "");
    row.push(fullAnnual || "");
    row.push(deductible || "");
    row.push(remaining);
    rows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // 컬럼 너비 설정 (대략)
  const colWidths: { wch: number }[] = [
    { wch: 12 }, // 사원
    { wch: 12 }, // 입사일
    ...Array.from({ length: daysInMonth }, () => ({ wch: 5 })),
    { wch: 6 }, // 반차
    { wch: 6 }, // 연차
    { wch: 8 }, // 차감일
    { wch: 8 }, // 잔여
  ];
  ws["!cols"] = colWidths;

  // 헤더 행 freeze
  ws["!freeze"] = { xSplit: 2, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  const sheetTitle = `${year}년 ${monthIdx + 1}월`;
  XLSX.utils.book_append_sheet(wb, ws, sheetTitle.slice(0, 31)); // 시트명 31자 제한

  // 시트 2: 메모/사유
  if (memoRows.length > 0) {
    const memoData: (string | number)[][] = [
      ["직원", "기간", "휴가 종류", "사유 / 메모"],
      ...memoRows.map((m) => [m.name, m.date, m.type, m.reason]),
    ];
    const wsMemo = XLSX.utils.aoa_to_sheet(memoData);
    wsMemo["!cols"] = [
      { wch: 12 },
      { wch: 22 },
      { wch: 10 },
      { wch: 60 },
    ];
    XLSX.utils.book_append_sheet(wb, wsMemo, "메모");
  }

  // 시트 3: 요약 (잔여 연차 요약 — 노무사 참고)
  const summaryRows: (string | number)[][] = [
    ["직원", "역할", "입사일자", "연차 한도", "사용", "잔여"],
    ...users.map((u) => [
      u.name,
      u.role.label,
      u.joinDate ? u.joinDate.toISOString().slice(0, 10) : "",
      u.annualLeaveTotal,
      u.annualLeaveUsed,
      u.annualLeaveTotal - u.annualLeaveUsed,
    ]),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 8 },
    { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, "잔여연차");

  // Uint8Array — Web standard BodyInit과 호환
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const filename = `근태_${year}-${String(monthIdx + 1).padStart(2, "0")}.xlsx`;

  return new NextResponse(new Uint8Array(arr), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

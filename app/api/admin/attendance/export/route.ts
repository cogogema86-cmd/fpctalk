/**
 * 월간 근태 매트릭스 엑셀 다운로드 (관리자 전용)
 * GET /api/admin/attendance/export?ym=YYYY-MM
 *
 * 학원 기존 양식과 동일한 색감/서식:
 * - 헤더: 옅은 파랑 + 굵은 글씨 + 가운데 정렬
 * - 토/일 컬럼: 옅은 회색 배경
 * - 휴가 종류별 셀 색상 (연차/반차/병가/공가/기타)
 * - 우측 합계: 반차/연차(파랑), 결근(노랑), 차감일(초록), 잔여(빨강 글씨)
 * - 보더 + freeze + 컬럼 너비
 */
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";
import {
  calcLeaveDays,
  getMonthlyApprovedLeaves,
} from "@/lib/attendance";

const TYPE_SHORT: Record<string, string> = {
  ANNUAL: "연차",
  HALF_AM: "오전",
  HALF_PM: "오후",
  SICK: "병가",
  OFFICIAL: "공가",
  OTHER: "기타",
  ABSENT: "결근",
  TARDY: "지각",
  EARLY_LEAVE: "조퇴",
};
const TYPE_LABEL: Record<string, string> = {
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
const TYPE_FILL: Record<string, string> = {
  ANNUAL: "FFDEE7F4",
  HALF_AM: "FFE8EFF8",
  HALF_PM: "FFE8EFF8",
  SICK: "FFF8E1E5",
  OFFICIAL: "FFE5DBF1",
  OTHER: "FFE8E8E8",
  ABSENT: "FFF8C9C9",
  TARDY: "FFFCE8C8",
  EARLY_LEAVE: "FFFBDCC2",
};

const COLOR_HEADER = "FFD9E1F2";
const COLOR_WEEKEND = "FFEEF2F8";
const COLOR_HALF_HEADER = "FFDDEBF7";
const COLOR_ANNUAL_HEADER = "FFDDEBF7";
const COLOR_ABSENT_HEADER = "FFFFF2CC";
const COLOR_DEDUCT_HEADER = "FFE2EFD9";
const COLOR_REMAIN_HEADER = "FFFCE4D6";
const BORDER_COLOR = "FFB4B4B4";

function thinBorder() {
  return {
    top: { style: "thin" as const, color: { argb: BORDER_COLOR } },
    left: { style: "thin" as const, color: { argb: BORDER_COLOR } },
    bottom: { style: "thin" as const, color: { argb: BORDER_COLOR } },
    right: { style: "thin" as const, color: { argb: BORDER_COLOR } },
  };
}

function fill(argb: string): ExcelJS.FillPattern {
  return {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb },
  };
}

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
  type Cell = { type: string; leaveId: string; reason: string | null };
  const matrix: Record<string, Record<number, Cell>> = {};
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

  const wb = new ExcelJS.Workbook();
  wb.creator = "FPCTalk";
  wb.created = new Date();

  // ============================================
  // 시트 1: 매트릭스
  // ============================================
  const sheetTitle = `${year}년 ${monthIdx + 1}월`.slice(0, 31);
  const ws = wb.addWorksheet(sheetTitle, {
    views: [{ state: "frozen", xSplit: 2, ySplit: 1 }],
  });

  // 컬럼 너비
  const cols: Partial<ExcelJS.Column>[] = [
    { width: 11 }, // 사원
    { width: 12 }, // 입사일
  ];
  for (let i = 0; i < daysInMonth; i++) cols.push({ width: 4.5 });
  cols.push({ width: 6 }); // 반차
  cols.push({ width: 6 }); // 연차
  cols.push({ width: 6 }); // 결근
  cols.push({ width: 8 }); // 차감일
  cols.push({ width: 9 }); // 잔여연차
  ws.columns = cols;

  // 헤더 행
  const headerCells: (string | number)[] = ["사원 정보", "입사일자"];
  for (let d = 1; d <= daysInMonth; d++) headerCells.push(d);
  headerCells.push("반차", "연차", "결근", "차감일", "잔여연차");
  const headerRow = ws.addRow(headerCells);
  headerRow.height = 24;

  // 헤더 스타일
  headerRow.eachCell((cell, colNumber) => {
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.font = { bold: true, size: 10 };
    cell.border = thinBorder();
    // 기본 헤더 색
    cell.fill = fill(COLOR_HEADER);

    // 우측 합계 컬럼별 색
    const totalStartCol = 2 + daysInMonth + 1; // 1-based
    if (colNumber === totalStartCol) cell.fill = fill(COLOR_HALF_HEADER);
    else if (colNumber === totalStartCol + 1) cell.fill = fill(COLOR_ANNUAL_HEADER);
    else if (colNumber === totalStartCol + 2) cell.fill = fill(COLOR_ABSENT_HEADER);
    else if (colNumber === totalStartCol + 3) cell.fill = fill(COLOR_DEDUCT_HEADER);
    else if (colNumber === totalStartCol + 4) {
      cell.fill = fill(COLOR_REMAIN_HEADER);
      cell.font = { bold: true, size: 10, color: { argb: "FFC00000" } };
    }
    // 일자 헤더: 일요일 빨강 / 토요일 파랑
    if (colNumber >= 3 && colNumber < 3 + daysInMonth) {
      const day = colNumber - 2;
      const dow = new Date(year, monthIdx, day).getDay();
      if (dow === 0)
        cell.font = { bold: true, size: 10, color: { argb: "FFC00000" } };
      else if (dow === 6)
        cell.font = { bold: true, size: 10, color: { argb: "FF1F4E78" } };
    }
  });

  // 데이터 행
  for (const u of users) {
    const cells = matrix[u.id] ?? {};
    let halfDays = 0;
    let fullAnnual = 0;
    let absentDays = 0;
    const seenLv = new Set<string>();
    for (const c of Object.values(cells)) {
      if (seenLv.has(c.leaveId)) continue;
      seenLv.add(c.leaveId);
      const lv = leaves.find((l) => l.id === c.leaveId);
      if (!lv) continue;
      if (lv.type === "HALF_AM" || lv.type === "HALF_PM") halfDays += 1;
      else if (lv.type === "ANNUAL")
        fullAnnual += calcLeaveDays(lv.type, lv.startDate, lv.endDate);
      else if (lv.type === "ABSENT")
        absentDays += calcLeaveDays(lv.type, lv.startDate, lv.endDate);
    }
    const deductible = fullAnnual + halfDays * 0.5;
    const remaining = u.annualLeaveTotal - u.annualLeaveUsed;

    const rowData: (string | number)[] = [
      u.name,
      u.joinDate ? u.joinDate.toISOString().slice(0, 10) : "",
    ];
    for (let day = 1; day <= daysInMonth; day++) {
      const c = cells[day];
      rowData.push(c ? TYPE_SHORT[c.type] ?? c.type : "");
    }
    rowData.push(
      halfDays || 0,
      fullAnnual || 0,
      absentDays || 0, // 결근 (ABSENT 일수 자동 카운트)
      deductible,
      remaining,
    );
    const row = ws.addRow(rowData);
    row.height = 22;

    row.eachCell((cell, colNumber) => {
      cell.border = thinBorder();
      cell.alignment = {
        horizontal: colNumber === 1 ? "center" : "center",
        vertical: "middle",
      };
      cell.font = { size: 10 };

      // 사원명 강조
      if (colNumber === 1) {
        cell.font = { size: 10, bold: true };
      }

      // 일자 셀 (3 ~ 2+daysInMonth)
      if (colNumber >= 3 && colNumber < 3 + daysInMonth) {
        const day = colNumber - 2;
        const dow = new Date(year, monthIdx, day).getDay();
        const c = cells[day];

        if (c) {
          // 휴가 종류별 색
          cell.fill = fill(TYPE_FILL[c.type] ?? "FFE8E8E8");
          cell.font = { size: 10, bold: true, color: { argb: "FF1F1F1F" } };
        } else if (dow === 0 || dow === 6) {
          cell.fill = fill(COLOR_WEEKEND);
        }
      }

      // 우측 합계 컬럼 색
      const totalStart = 2 + daysInMonth + 1;
      if (colNumber === totalStart) {
        cell.fill = fill(COLOR_HALF_HEADER);
        cell.numFmt = "0.0";
      } else if (colNumber === totalStart + 1) {
        cell.fill = fill(COLOR_ANNUAL_HEADER);
        cell.numFmt = "0.0";
      } else if (colNumber === totalStart + 2) {
        cell.fill = fill(COLOR_ABSENT_HEADER);
        cell.numFmt = "0";
      } else if (colNumber === totalStart + 3) {
        cell.fill = fill(COLOR_DEDUCT_HEADER);
        cell.numFmt = "0.0";
      } else if (colNumber === totalStart + 4) {
        cell.fill = fill(COLOR_REMAIN_HEADER);
        cell.numFmt = "0.0";
        cell.font = {
          size: 10,
          bold: true,
          color: { argb: remaining < 0 ? "FFC00000" : "FF1F1F1F" },
        };
      }
    });
  }

  // ============================================
  // 시트 2: 메모/사유 (있을 때만)
  // ============================================
  if (memoRows.length > 0) {
    const wsMemo = wb.addWorksheet("메모", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    wsMemo.columns = [
      { width: 12 },
      { width: 24 },
      { width: 12 },
      { width: 60 },
    ];
    const memoHeader = wsMemo.addRow(["직원", "기간", "휴가 종류", "사유 / 메모"]);
    memoHeader.height = 22;
    memoHeader.eachCell((cell) => {
      cell.fill = fill(COLOR_HEADER);
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = thinBorder();
    });
    for (const m of memoRows) {
      const r = wsMemo.addRow([m.name, m.date, m.type, m.reason]);
      r.eachCell((cell, colNumber) => {
        cell.border = thinBorder();
        cell.font = { size: 10 };
        cell.alignment = {
          horizontal: colNumber === 4 ? "left" : "center",
          vertical: "middle",
          wrapText: colNumber === 4,
        };
      });
    }
  }

  // ============================================
  // 시트 3: 잔여연차 요약
  // ============================================
  const wsSummary = wb.addWorksheet("잔여연차", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  wsSummary.columns = [
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 9 },
    { width: 9 },
    { width: 9 },
  ];
  const sumHeader = wsSummary.addRow([
    "직원",
    "역할",
    "입사일자",
    "한도",
    "사용",
    "잔여",
  ]);
  sumHeader.height = 22;
  sumHeader.eachCell((cell, colNumber) => {
    cell.fill = fill(colNumber === 6 ? COLOR_REMAIN_HEADER : COLOR_HEADER);
    cell.font = {
      bold: true,
      size: 10,
      color: colNumber === 6 ? { argb: "FFC00000" } : undefined,
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder();
  });
  for (const u of users) {
    const remaining = u.annualLeaveTotal - u.annualLeaveUsed;
    const row = wsSummary.addRow([
      u.name,
      u.role.label,
      u.joinDate ? u.joinDate.toISOString().slice(0, 10) : "",
      u.annualLeaveTotal,
      u.annualLeaveUsed,
      remaining,
    ]);
    row.eachCell((cell, colNumber) => {
      cell.border = thinBorder();
      cell.font = { size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      if (colNumber === 1) cell.font = { size: 10, bold: true };
      if (colNumber >= 4) cell.numFmt = "0.0";
      if (colNumber === 6) {
        cell.fill = fill(COLOR_REMAIN_HEADER);
        cell.font = {
          size: 10,
          bold: true,
          color: { argb: remaining < 0 ? "FFC00000" : "FF1F1F1F" },
        };
      }
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `근태_${year}-${String(monthIdx + 1).padStart(2, "0")}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * 근태 (출퇴근 + 연차) 헬퍼 (서버 전용)
 */
import { prisma } from "@/lib/db";
import type { LeaveType } from "@prisma/client";

// =====================================================
// 날짜 유틸 (date-fns 의존성 없이 단순 처리)
// =====================================================
export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** YYYY-MM-DD */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// =====================================================
// 출퇴근
// =====================================================
export async function getTodayAttendance(userId: string) {
  const now = new Date();
  return prisma.attendance.findMany({
    where: {
      userId,
      at: { gte: startOfDay(now), lte: endOfDay(now) },
    },
    orderBy: { at: "asc" },
  });
}

export async function checkIn(userId: string) {
  const today = await getTodayAttendance(userId);
  if (today.some((a) => a.type === "CHECK_IN")) {
    throw new Error("오늘 이미 출근 체크하셨습니다.");
  }
  return prisma.attendance.create({
    data: { userId, type: "CHECK_IN" },
  });
}

export async function checkOut(userId: string) {
  const today = await getTodayAttendance(userId);
  if (!today.some((a) => a.type === "CHECK_IN")) {
    throw new Error("출근 체크 먼저 해주세요.");
  }
  if (today.some((a) => a.type === "CHECK_OUT")) {
    throw new Error("이미 퇴근 체크하셨습니다.");
  }
  return prisma.attendance.create({
    data: { userId, type: "CHECK_OUT" },
  });
}

export async function getMonthlyAttendance(
  userId: string,
  year: number,
  monthIdx: number, // 0-11
) {
  const start = new Date(year, monthIdx, 1);
  const end = endOfMonth(start);
  return prisma.attendance.findMany({
    where: { userId, at: { gte: start, lte: end } },
    orderBy: { at: "asc" },
  });
}

// =====================================================
// 연차/휴가
// =====================================================

/** 신청한 일수 계산 (반차는 0.5일, 외 일수는 양 끝 포함) */
export function calcLeaveDays(type: LeaveType, start: Date, end: Date): number {
  if (type === "HALF_AM" || type === "HALF_PM") return 0.5;
  const ms = endOfDay(end).getTime() - startOfDay(start).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

export async function getMyLeaveRequests(userId: string) {
  return prisma.leaveRequest.findMany({
    where: { requesterId: userId },
    include: {
      approver: { select: { id: true, name: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPendingLeaveRequests() {
  return prisma.leaveRequest.findMany({
    where: { status: "PENDING" },
    include: {
      requester: {
        select: { id: true, name: true, username: true, role: { select: { label: true } } },
      },
    },
    orderBy: { createdAt: "asc" }, // 오래된 것 먼저
  });
}

export async function getRecentLeaveRequests(limit = 30) {
  return prisma.leaveRequest.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      requester: {
        select: { id: true, name: true, username: true, role: { select: { label: true } } },
      },
      approver: { select: { id: true, name: true, username: true } },
    },
  });
}

/**
 * 캘린더 표시용 — 특정 월에 걸치는 승인된 휴가 목록.
 * scope:
 *   "mine" → 본인 것만 (직원용)
 *   "all"  → 전 직원 (관리자용)
 */
export async function getMonthlyApprovedLeaves(
  year: number,
  monthIdx: number,
  scope: "mine" | "all",
  userId?: string,
) {
  const start = new Date(year, monthIdx, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIdx + 1, 0, 23, 59, 59, 999);

  return prisma.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      ...(scope === "mine" && userId ? { requesterId: userId } : {}),
      // 이 월과 겹치는 모든 휴가 (start <= monthEnd && end >= monthStart)
      startDate: { lte: end },
      endDate: { gte: start },
    },
    include: {
      requester: { select: { id: true, name: true } },
    },
    orderBy: { startDate: "asc" },
  });
}

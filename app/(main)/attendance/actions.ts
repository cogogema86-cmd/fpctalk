"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";
import { calcLeaveDays, checkIn, checkOut } from "@/lib/attendance";
import type { LeaveType } from "@prisma/client";

// =====================================================
// 출퇴근 체크
// =====================================================
export type CheckResult = { error?: string };

export async function checkInAction(): Promise<CheckResult> {
  const me = await getMe();
  if (!me) return { error: "로그인이 필요합니다." };
  try {
    await checkIn(me.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "출근 체크 실패" };
  }
  revalidatePath("/attendance");
  return {};
}

export async function checkOutAction(): Promise<CheckResult> {
  const me = await getMe();
  if (!me) return { error: "로그인이 필요합니다." };
  try {
    await checkOut(me.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "퇴근 체크 실패" };
  }
  revalidatePath("/attendance");
  return {};
}

// =====================================================
// 연차 신청
// =====================================================
const VALID_LEAVE_TYPES: LeaveType[] = [
  "ANNUAL",
  "HALF_AM",
  "HALF_PM",
  "SICK",
  "OFFICIAL",
  "OTHER",
];

export type LeaveFormState = {
  error?: string;
  success?: boolean;
};

export async function requestLeaveAction(
  _prev: LeaveFormState,
  formData: FormData,
): Promise<LeaveFormState> {
  const me = await getMe();
  if (!me) return { error: "로그인이 필요합니다." };

  const type = formData.get("type") as LeaveType;
  const startStr = formData.get("startDate") as string;
  const endStr = formData.get("endDate") as string;
  const reason = ((formData.get("reason") as string) ?? "").trim();

  if (!VALID_LEAVE_TYPES.includes(type)) {
    return { error: "휴가 종류를 선택해주세요." };
  }
  if (!startStr) return { error: "시작일을 입력해주세요." };

  // 반차는 시작=종료 같은 날, 그 외는 종료 필수
  const start = new Date(startStr);
  const end = type === "HALF_AM" || type === "HALF_PM"
    ? start
    : new Date(endStr || startStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { error: "날짜 형식이 잘못되었습니다." };
  }
  if (end < start) {
    return { error: "종료일은 시작일 이후여야 합니다." };
  }

  const days = calcLeaveDays(type, start, end);

  // 잔여 연차 검증 (ANNUAL/HALF만 차감 대상)
  if (type === "ANNUAL" || type === "HALF_AM" || type === "HALF_PM") {
    const fresh = await prisma.user.findUnique({
      where: { id: me.id },
      select: { annualLeaveTotal: true, annualLeaveUsed: true },
    });
    if (!fresh) return { error: "사용자 정보를 찾을 수 없습니다." };

    // 이미 PENDING/APPROVED인 신청들의 합계도 빼야 함
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

    const remaining = fresh.annualLeaveTotal - fresh.annualLeaveUsed - reservedDays;
    if (days > remaining) {
      return {
        error: `잔여 연차가 부족합니다 (잔여 ${remaining}일, 신청 ${days}일)`,
      };
    }
  }

  await prisma.leaveRequest.create({
    data: {
      requesterId: me.id,
      type,
      startDate: start,
      endDate: end,
      reason: reason || null,
      status: "PENDING",
    },
  });

  revalidatePath("/attendance");
  revalidatePath("/admin/leave");
  return { success: true };
}

// =====================================================
// 본인 신청 취소 (PENDING만)
// =====================================================
export async function cancelLeaveAction(
  leaveId: string,
): Promise<{ error?: string }> {
  const me = await getMe();
  if (!me) return { error: "로그인이 필요합니다." };

  const target = await prisma.leaveRequest.findUnique({
    where: { id: leaveId },
  });
  if (!target) return { error: "신청을 찾을 수 없습니다." };
  if (target.requesterId !== me.id) {
    return { error: "본인 신청만 취소할 수 있습니다." };
  }
  if (target.status !== "PENDING") {
    return { error: "이미 처리된 신청은 취소할 수 없습니다." };
  }

  await prisma.leaveRequest.update({
    where: { id: leaveId },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/attendance");
  revalidatePath("/admin/leave");
  return {};
}

// =====================================================
// 관리자: 직원 대신 휴가 등록 (직접 못하는 직원 대신)
// - 자동 APPROVED, decidedNote = "관리자 직접 입력"
// - ANNUAL/HALF면 annualLeaveUsed 자동 차감 + LeaveAdjustment 감사 로그
// =====================================================
export async function addLeaveByAdminAction(input: {
  userId: string;
  type: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate?: string;
  reason?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };
  const meWithRole = await prisma.user.findUnique({
    where: { id: me.id },
    include: { role: { select: { isAdmin: true } } },
  });
  if (!meWithRole?.role.isAdmin) {
    return { ok: false, error: "관리자만 등록할 수 있습니다." };
  }

  if (!VALID_LEAVE_TYPES.includes(input.type)) {
    return { ok: false, error: "휴가 종류가 올바르지 않습니다." };
  }
  const start = new Date(input.startDate);
  const end =
    input.type === "HALF_AM" || input.type === "HALF_PM"
      ? start
      : new Date(input.endDate || input.startDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { ok: false, error: "날짜 형식이 잘못되었습니다." };
  }
  if (end < start) {
    return { ok: false, error: "종료일은 시작일 이후여야 합니다." };
  }

  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, annualLeaveUsed: true },
  });
  if (!target) return { ok: false, error: "직원을 찾을 수 없습니다." };

  const days = calcLeaveDays(input.type, start, end);
  const isCounted =
    input.type === "ANNUAL" ||
    input.type === "HALF_AM" ||
    input.type === "HALF_PM";

  if (isCounted) {
    const before = target.annualLeaveUsed;
    const after = before + days;
    await prisma.$transaction([
      prisma.leaveRequest.create({
        data: {
          requesterId: input.userId,
          approverId: me.id,
          type: input.type,
          startDate: start,
          endDate: end,
          reason: input.reason?.trim() || null,
          status: "APPROVED",
          decidedAt: new Date(),
          decidedNote: "관리자 직접 입력",
        },
      }),
      prisma.user.update({
        where: { id: input.userId },
        data: { annualLeaveUsed: after },
      }),
      prisma.leaveAdjustment.create({
        data: {
          userId: input.userId,
          adminId: me.id,
          field: "USED",
          before,
          after,
          reason: `관리자 직접 등록 — ${input.type} ${days}일 (${start.toISOString().slice(0, 10)} ~ ${end.toISOString().slice(0, 10)})`,
        },
      }),
    ]);
  } else {
    await prisma.leaveRequest.create({
      data: {
        requesterId: input.userId,
        approverId: me.id,
        type: input.type,
        startDate: start,
        endDate: end,
        reason: input.reason?.trim() || null,
        status: "APPROVED",
        decidedAt: new Date(),
        decidedNote: "관리자 직접 입력",
      },
    });
  }

  revalidatePath("/admin/attendance");
  revalidatePath("/attendance");
  revalidatePath("/admin/leave");
  return { ok: true };
}

// =====================================================
// 관리자: 휴가 삭제 (어떤 상태든)
// - APPROVED + ANNUAL/HALF_AM/HALF_PM이었다면 annualLeaveUsed 자동 보정
// - LeaveAdjustment 감사로그 자동 기록
// - LeaveRequest는 status=CANCELLED + decidedNote에 "관리자 삭제" 기록 (흔적 보존)
// =====================================================
export async function deleteLeaveByAdminAction(
  leaveId: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const meWithRole = await prisma.user.findUnique({
    where: { id: me.id },
    include: { role: { select: { isAdmin: true } } },
  });
  if (!meWithRole?.role.isAdmin) {
    return { ok: false, error: "관리자만 삭제할 수 있습니다." };
  }

  const target = await prisma.leaveRequest.findUnique({
    where: { id: leaveId },
  });
  if (!target) return { ok: false, error: "휴가를 찾을 수 없습니다." };
  if (target.status === "CANCELLED" || target.status === "REJECTED") {
    return { ok: false, error: "이미 취소된 휴가입니다." };
  }

  const isCountedLeave =
    target.type === "ANNUAL" ||
    target.type === "HALF_AM" ||
    target.type === "HALF_PM";

  // APPROVED + 차감 대상이었으면 annualLeaveUsed 보정 + 감사 로그
  if (target.status === "APPROVED" && isCountedLeave) {
    const days = calcLeaveDays(target.type, target.startDate, target.endDate);
    const u = await prisma.user.findUnique({
      where: { id: target.requesterId },
      select: { annualLeaveUsed: true },
    });
    const before = u?.annualLeaveUsed ?? 0;
    const after = Math.max(0, before - days);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: target.requesterId },
        data: { annualLeaveUsed: after },
      }),
      prisma.leaveAdjustment.create({
        data: {
          userId: target.requesterId,
          adminId: me.id,
          field: "USED",
          before,
          after,
          reason: `휴가 삭제 — ${target.type} ${days}일 (${target.startDate.toISOString().slice(0, 10)} ~ ${target.endDate.toISOString().slice(0, 10)})`,
        },
      }),
      prisma.leaveRequest.update({
        where: { id: leaveId },
        data: {
          status: "CANCELLED",
          decidedAt: new Date(),
          decidedNote: "관리자가 삭제",
          approverId: me.id,
        },
      }),
    ]);
  } else {
    // PENDING / APPROVED-비차감 → 단순 CANCELLED 처리
    await prisma.leaveRequest.update({
      where: { id: leaveId },
      data: {
        status: "CANCELLED",
        decidedAt: new Date(),
        decidedNote: "관리자가 삭제",
        approverId: me.id,
      },
    });
  }

  revalidatePath("/attendance");
  revalidatePath("/admin/leave");
  return { ok: true };
}

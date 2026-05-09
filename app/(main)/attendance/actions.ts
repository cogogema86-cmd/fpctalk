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

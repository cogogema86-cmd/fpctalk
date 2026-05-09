"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { calcLeaveDays } from "@/lib/attendance";

async function requireAdmin(): Promise<
  { ok: true; meId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { ok: false, error: "로그인이 필요합니다." };
  const me = await prisma.user.findUnique({
    where: { authId: authUser.id },
    include: { role: true },
  });
  if (!me) return { ok: false, error: "사용자 정보를 찾을 수 없습니다." };
  if (!me.role.isAdmin) return { ok: false, error: "관리자 권한이 필요합니다." };
  return { ok: true, meId: me.id };
}

// =====================================================
// 승인
// =====================================================
export async function approveLeaveAction(
  leaveId: string,
): Promise<{ error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  const target = await prisma.leaveRequest.findUnique({
    where: { id: leaveId },
  });
  if (!target) return { error: "신청을 찾을 수 없습니다." };
  if (target.status !== "PENDING") {
    return { error: "이미 처리된 신청입니다." };
  }

  const days = calcLeaveDays(target.type, target.startDate, target.endDate);
  const isAnnualType =
    target.type === "ANNUAL" ||
    target.type === "HALF_AM" ||
    target.type === "HALF_PM";

  // 트랜잭션: 상태 변경 + 연차 차감 (해당 type일 때만)
  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: leaveId },
      data: {
        status: "APPROVED",
        approverId: guard.meId,
        decidedAt: new Date(),
      },
    });

    if (isAnnualType) {
      await tx.user.update({
        where: { id: target.requesterId },
        data: { annualLeaveUsed: { increment: days } },
      });
    }
  });

  revalidatePath("/admin/leave");
  revalidatePath("/attendance");
  return {};
}

// =====================================================
// 거부
// =====================================================
export async function rejectLeaveAction(
  leaveId: string,
  note: string,
): Promise<{ error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  const target = await prisma.leaveRequest.findUnique({
    where: { id: leaveId },
  });
  if (!target) return { error: "신청을 찾을 수 없습니다." };
  if (target.status !== "PENDING") {
    return { error: "이미 처리된 신청입니다." };
  }

  await prisma.leaveRequest.update({
    where: { id: leaveId },
    data: {
      status: "REJECTED",
      approverId: guard.meId,
      decidedAt: new Date(),
      decidedNote: note.trim() || null,
    },
  });

  revalidatePath("/admin/leave");
  revalidatePath("/attendance");
  return {};
}

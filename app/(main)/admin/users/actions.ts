"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import {
  generatePassword,
  isValidUsername,
  usernameToEmail,
} from "@/lib/auth";
import { revalidatePath } from "next/cache";

async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;
  return prisma.user.findUnique({
    where: { authId: authUser.id },
    include: { role: true },
  });
}

async function requireAdmin(): Promise<
  { ok: true; me: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> } | { ok: false; error: string }
> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };
  if (!me.role.isAdmin) return { ok: false, error: "관리자 권한이 필요합니다." };
  return { ok: true, me };
}

// =====================================================
// 직원 추가
// =====================================================
export type CreateStaffState = {
  error?: string;
  success?: {
    username: string;
    name: string;
    password: string;
  };
};

export async function createStaffAction(
  _prev: CreateStaffState,
  formData: FormData,
): Promise<CreateStaffState> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  const username = (formData.get("username") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const roleId = formData.get("roleId") as string;
  const title = ((formData.get("title") as string) ?? "").trim() || null;
  const passwordInput = (formData.get("password") as string)?.trim();
  const joinDateRaw = ((formData.get("joinDate") as string) ?? "").trim();
  const annualLeaveTotalRaw = ((formData.get("annualLeaveTotal") as string) ?? "").trim();

  if (!isValidUsername(username)) {
    return { error: "아이디는 영문/숫자/_/- 3~20자여야 합니다." };
  }
  if (!name) return { error: "이름을 입력해주세요." };
  if (!roleId) return { error: "역할을 선택해주세요." };
  if (passwordInput && passwordInput.length < 6) {
    return { error: "비밀번호는 최소 6자 이상이어야 합니다." };
  }

  // 입사일 파싱 — yyyy-mm-dd
  let joinDate: Date | null = null;
  if (joinDateRaw) {
    const d = new Date(joinDateRaw);
    if (isNaN(d.getTime())) return { error: "입사일자가 올바르지 않습니다." };
    joinDate = d;
  }

  // 연차 한도 파싱
  let annualLeaveTotal: number | undefined;
  if (annualLeaveTotalRaw) {
    const n = Number(annualLeaveTotalRaw);
    if (!Number.isFinite(n) || n < 0 || n > 365) {
      return { error: "연차 한도는 0 이상 365 이하의 숫자여야 합니다." };
    }
    annualLeaveTotal = n;
  }

  const role = await prisma.staffRole.findUnique({ where: { id: roleId } });
  if (!role) return { error: "유효하지 않은 역할입니다." };

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return { error: `아이디 "${username}"는 이미 사용 중입니다.` };
  }

  const password = passwordInput || generatePassword();
  const email = usernameToEmail(username);

  const admin = createAdminClient();
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, name, role: role.code },
  });

  if (authError || !authData.user) {
    return {
      error: `Auth 생성 실패: ${authError?.message ?? "알 수 없는 에러"}`,
    };
  }

  try {
    await prisma.user.create({
      data: {
        authId: authData.user.id,
        username,
        name,
        roleId: role.id,
        level: role.defaultLevel,
        title,
        joinDate,
        ...(annualLeaveTotal !== undefined ? { annualLeaveTotal } : {}),
      },
    });
  } catch (e) {
    await admin.auth.admin.deleteUser(authData.user.id).catch(() => {});
    return {
      error: `DB 저장 실패: ${e instanceof Error ? e.message : "알 수 없는 에러"}`,
    };
  }

  revalidatePath("/admin/users");
  return { success: { username, name, password } };
}

// =====================================================
// 직원 수정
// =====================================================
export type UpdateStaffState = {
  error?: string;
  success?: boolean;
};

export async function updateStaffAction(
  _prev: UpdateStaffState,
  formData: FormData,
): Promise<UpdateStaffState> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const me = guard.me;

  const id = formData.get("id") as string;
  const username = (formData.get("username") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const roleId = formData.get("roleId") as string;
  const title = ((formData.get("title") as string) ?? "").trim() || null;
  const joinDateRaw = ((formData.get("joinDate") as string) ?? "").trim();

  if (!id || !username || !name || !roleId) {
    return { error: "필수 정보가 누락되었습니다." };
  }
  if (!isValidUsername(username)) {
    return { error: "아이디는 영문/숫자/_/- 3~20자여야 합니다." };
  }

  // 입사일 파싱 (빈 값이면 null로 클리어)
  let joinDate: Date | null = null;
  if (joinDateRaw) {
    const d = new Date(joinDateRaw);
    if (isNaN(d.getTime())) return { error: "입사일자가 올바르지 않습니다." };
    joinDate = d;
  }

  const target = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  if (!target) return { error: "직원을 찾을 수 없습니다." };

  const newRole = await prisma.staffRole.findUnique({ where: { id: roleId } });
  if (!newRole) return { error: "유효하지 않은 역할입니다." };

  // 락아웃 방지: 본인이 본인의 역할을 admin 없는 역할로 변경하려 함
  if (target.id === me.id && target.role.isAdmin && !newRole.isAdmin) {
    return {
      error:
        "본인을 관리권한 없는 역할로 변경할 수 없습니다. 다른 사람에게 관리권한을 먼저 주세요.",
    };
  }

  // 락아웃 방지: 시스템에서 admin 사용자가 0명 되는 변경
  if (target.role.isAdmin && !newRole.isAdmin) {
    const otherAdmins = await prisma.user.count({
      where: {
        id: { not: target.id },
        role: { isAdmin: true },
      },
    });
    if (otherAdmins === 0) {
      return {
        error:
          "이 직원의 역할을 변경하면 시스템에 관리자가 한 명도 남지 않습니다.",
      };
    }
  }

  // username 변경 시: 중복 검사 + Supabase Auth 이메일도 업데이트
  if (username !== target.username) {
    const dup = await prisma.user.findUnique({ where: { username } });
    if (dup) return { error: `아이디 "${username}"는 이미 사용 중입니다.` };

    const newEmail = usernameToEmail(username);
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(target.authId, {
      email: newEmail,
      email_confirm: true,
    });
    if (error) return { error: `Auth 이메일 업데이트 실패: ${error.message}` };
  }

  await prisma.user.update({
    where: { id },
    data: {
      username,
      name,
      roleId,
      title,
      joinDate, // null 또는 Date — 빈 문자열 입력 시 null로 클리어
      // level은 역할 바뀌어도 자동으로 안 바꿈 (수동 조정 가능하게)
    },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}/edit`);
  return { success: true };
}

// =====================================================
// 연차 잔여 조정 (관리자 직접 변경)
// - field=TOTAL: annualLeaveTotal 변경 (한도)
// - field=USED:  annualLeaveUsed 변경 (사용량)
// - LeaveAdjustment 감사로그 자동 기록
// =====================================================
export type AdjustLeaveResult = {
  ok: boolean;
  error?: string;
};

export async function adjustLeaveAction(
  userId: string,
  field: "TOTAL" | "USED",
  newValue: number,
  reason: string,
): Promise<AdjustLeaveResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const me = guard.me;

  if (!Number.isFinite(newValue) || newValue < 0 || newValue > 365) {
    return { ok: false, error: "값은 0 이상 365 이하의 숫자여야 합니다." };
  }
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    return { ok: false, error: "변경 사유를 입력해주세요." };
  }
  if (trimmedReason.length > 500) {
    return { ok: false, error: "변경 사유는 500자 이하로 입력해주세요." };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, annualLeaveTotal: true, annualLeaveUsed: true },
  });
  if (!target) return { ok: false, error: "직원을 찾을 수 없습니다." };

  const before = field === "TOTAL" ? target.annualLeaveTotal : target.annualLeaveUsed;
  if (before === newValue) {
    return { ok: false, error: "변경된 값이 없습니다." };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data:
        field === "TOTAL"
          ? { annualLeaveTotal: newValue }
          : { annualLeaveUsed: newValue },
    }),
    prisma.leaveAdjustment.create({
      data: {
        userId,
        adminId: me.id,
        field,
        before,
        after: newValue,
        reason: trimmedReason,
      },
    }),
  ]);

  revalidatePath(`/admin/users/${userId}/edit`);
  revalidatePath("/admin/users");
  return { ok: true };
}

// =====================================================
// 비밀번호 재설정 (관리자가 직원 비번 초기화)
// - customPassword 제공 시 그 값으로 설정 (운영자가 직접 정함)
// - 없거나 빈 문자열이면 자동 랜덤 생성 (10자)
// =====================================================
export type ResetPasswordResult = {
  error?: string;
  newPassword?: string;
  username?: string;
};

export async function resetPasswordAction(
  userId: string,
  customPassword?: string,
): Promise<ResetPasswordResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { authId: true, username: true },
  });
  if (!target) return { error: "직원을 찾을 수 없습니다." };

  let newPassword: string;
  const trimmed = customPassword?.trim() ?? "";
  if (trimmed.length > 0) {
    if (trimmed.length < 6) {
      return { error: "비밀번호는 6자 이상이어야 합니다." };
    }
    if (trimmed.length > 100) {
      return { error: "비밀번호는 100자 이하로 입력해주세요." };
    }
    newPassword = trimmed;
  } else {
    newPassword = generatePassword();
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(target.authId, {
    password: newPassword,
  });

  if (error) return { error: `초기화 실패: ${error.message}` };

  return { newPassword, username: target.username };
}

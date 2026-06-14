"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
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

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };
  if (!me.role.isAdmin || !me.role.canManageRoles)
    return { ok: false, error: "역할 관리 권한이 없습니다." };
  return { ok: true };
}

/** 폼에서 세부 권한 5종을 읽는다 (체크박스). */
function readFeatureFlags(formData: FormData) {
  return {
    canManageUsers: formData.get("canManageUsers") === "on",
    canManageRoles: formData.get("canManageRoles") === "on",
    canApproveLeave: formData.get("canApproveLeave") === "on",
    canManageAttendance: formData.get("canManageAttendance") === "on",
    canManageAI: formData.get("canManageAI") === "on",
    canViewStorage: formData.get("canViewStorage") === "on",
  };
}

export type RoleFormState = {
  error?: string;
  success?: boolean;
};

// =====================================================
// 역할 추가
// =====================================================
export async function createRoleAction(
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  const label = (formData.get("label") as string)?.trim();
  const defaultLevel = parseInt(formData.get("defaultLevel") as string, 10) || 0;
  const isAdminFlag = formData.get("isAdmin") === "on";
  const sortOrder = parseInt(formData.get("sortOrder") as string, 10) || 100;
  const flags = readFeatureFlags(formData);

  if (!label) return { error: "역할 이름을 입력해주세요." };
  if (label.length > 30) return { error: "역할 이름은 30자 이하로 입력해주세요." };
  if (!Number.isFinite(defaultLevel) || defaultLevel < 0 || defaultLevel > 99) {
    return { error: "기본 레벨은 0~99 사이의 숫자로 입력해주세요." };
  }

  const existing = await prisma.staffRole.findFirst({ where: { label } });
  if (existing) return { error: `이미 같은 이름의 역할이 있습니다: ${label}` };

  const code = `custom_${Math.random().toString(36).slice(2, 8)}`;

  await prisma.staffRole.create({
    data: {
      code,
      label,
      defaultLevel,
      isAdmin: isAdminFlag,
      // 관리자가 아니면 세부 권한은 의미 없으므로 false로 저장
      ...(isAdminFlag ? flags : {
        canManageUsers: false,
        canManageRoles: false,
        canApproveLeave: false,
        canManageAttendance: false,
        canManageAI: false,
        canViewStorage: false,
      }),
      isSystem: false,
      sortOrder,
    },
  });

  revalidatePath("/admin/roles");
  revalidatePath("/admin/users/new");
  return { success: true };
}

// =====================================================
// 역할 수정 — 모든 필드 편집 가능 (시스템 역할 포함)
// 단, 본인이 사용 중인 역할의 관리권한은 끌 수 없음 (lockout 방지)
// =====================================================
export async function updateRoleAction(
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const me = await getCurrentUser();
  if (!me) return { error: "로그인이 필요합니다." };
  if (!me.role.isAdmin || !me.role.canManageRoles)
    return { error: "역할 관리 권한이 없습니다." };

  const id = formData.get("id") as string;
  const label = (formData.get("label") as string)?.trim();
  const defaultLevel = parseInt(formData.get("defaultLevel") as string, 10) || 0;
  const isAdminFlag = formData.get("isAdmin") === "on";
  const sortOrder = parseInt(formData.get("sortOrder") as string, 10) || 100;
  const flags = readFeatureFlags(formData);
  // 세부 권한은 관리자일 때만 적용 (isAdmin 끄면 전부 false)
  const effectiveFlags = isAdminFlag
    ? flags
    : {
        canManageUsers: false,
        canManageRoles: false,
        canApproveLeave: false,
        canManageAttendance: false,
        canManageAI: false,
        canViewStorage: false,
      };

  if (!id || !label) return { error: "필수 정보가 누락되었습니다." };
  if (label.length > 30) return { error: "역할 이름은 30자 이하로 입력해주세요." };
  if (!Number.isFinite(defaultLevel) || defaultLevel < 0 || defaultLevel > 99) {
    return { error: "기본 레벨은 0~99 사이의 숫자로 입력해주세요." };
  }

  const role = await prisma.staffRole.findUnique({ where: { id } });
  if (!role) return { error: "역할을 찾을 수 없습니다." };

  // 같은 라벨 중복 체크 (자기 자신 제외)
  const dup = await prisma.staffRole.findFirst({
    where: { label, NOT: { id } },
  });
  if (dup) return { error: `이미 같은 이름의 역할이 있습니다: ${label}` };

  // 락아웃 방지 1: 본인이 쓰는 역할의 isAdmin을 끄려는 경우
  if (me.roleId === id && role.isAdmin && !isAdminFlag) {
    return {
      error:
        "본인이 사용 중인 역할의 관리권한은 끌 수 없습니다. 다른 사용자에게 관리권한 역할을 먼저 부여한 뒤 본인 역할을 변경하세요.",
    };
  }

  // 락아웃 방지 2: 어떤 역할이 isAdmin을 잃을 때, 시스템에 관리자 가진 다른 사용자가 1명 이상 남는지 확인
  if (role.isAdmin && !isAdminFlag) {
    const otherAdmins = await prisma.user.count({
      where: {
        roleId: { not: id },
        role: { isAdmin: true },
      },
    });
    if (otherAdmins === 0) {
      return {
        error:
          "이 역할의 관리권한을 끄면 시스템에 관리자가 한 명도 남지 않습니다. 먼저 다른 역할에 관리권한을 부여하고 직원을 그 역할로 옮기세요.",
      };
    }
  }

  // 락아웃 방지 3: 역할 관리(canManageRoles) 권한 — 이걸 잃으면 아무도 역할을 못 바꿈
  const hadRoleMgmt = role.isAdmin && role.canManageRoles;
  const willHaveRoleMgmt = isAdminFlag && effectiveFlags.canManageRoles;
  if (hadRoleMgmt && !willHaveRoleMgmt) {
    // 3a: 본인이 쓰는 역할의 역할관리 권한을 끄려는 경우
    if (me.roleId === id) {
      return {
        error:
          "본인이 사용 중인 역할의 '역할 관리' 권한은 끌 수 없습니다. 다른 사용자에게 역할 관리 권한을 먼저 부여하세요.",
      };
    }
    // 3b: 이 역할이 역할관리를 잃으면 시스템에 역할관리 가능한 사용자가 0명이 되는지
    const otherRoleManagers = await prisma.user.count({
      where: {
        roleId: { not: id },
        role: { isAdmin: true, canManageRoles: true },
      },
    });
    if (otherRoleManagers === 0) {
      return {
        error:
          "이 권한을 끄면 '역할 관리'를 할 수 있는 사용자가 한 명도 남지 않습니다. 먼저 다른 역할에 역할 관리 권한을 부여하세요.",
      };
    }
  }

  await prisma.staffRole.update({
    where: { id },
    data: {
      label,
      defaultLevel,
      isAdmin: isAdminFlag,
      ...effectiveFlags,
      sortOrder,
    },
  });

  revalidatePath("/admin/roles");
  revalidatePath("/admin/users/new");
  revalidatePath("/admin/users");
  revalidatePath("/dashboard");
  return { success: true };
}

// =====================================================
// 역할 삭제 (커스텀만, 사용 중이면 거부)
// =====================================================
export async function deleteRoleAction(
  roleId: string,
): Promise<{ error?: string; success?: boolean }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  const role = await prisma.staffRole.findUnique({
    where: { id: roleId },
    include: { _count: { select: { users: true } } },
  });
  if (!role) return { error: "역할을 찾을 수 없습니다." };
  if (role.isSystem) return { error: "시스템 기본 역할은 삭제할 수 없습니다." };
  if (role._count.users > 0) {
    return {
      error: `이 역할을 사용 중인 직원이 ${role._count.users}명 있습니다. 먼저 다른 역할로 변경하세요.`,
    };
  }

  await prisma.staffRole.delete({ where: { id: roleId } });
  revalidatePath("/admin/roles");
  revalidatePath("/admin/users/new");
  return { success: true };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
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
  return { ok: true };
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

  if (!label) return { error: "역할 이름을 입력해주세요." };
  if (label.length > 30) return { error: "역할 이름은 30자 이하로 입력해주세요." };
  if (defaultLevel < 0 || defaultLevel > 3) {
    return { error: "기본 레벨은 0~3 사이로 입력해주세요." };
  }

  // 중복 라벨 체크
  const existing = await prisma.staffRole.findFirst({ where: { label } });
  if (existing) return { error: `이미 같은 이름의 역할이 있습니다: ${label}` };

  // code는 자동 생성 (cuid 일부 사용)
  const code = `custom_${Math.random().toString(36).slice(2, 8)}`;

  await prisma.staffRole.create({
    data: {
      code,
      label,
      defaultLevel,
      isAdmin: isAdminFlag,
      isSystem: false,
      sortOrder,
    },
  });

  revalidatePath("/admin/roles");
  revalidatePath("/admin/users/new");
  return { success: true };
}

// =====================================================
// 역할 수정 (label, defaultLevel, isAdmin, sortOrder)
// 시스템 역할은 라벨/정렬만 수정 가능, isAdmin/level은 잠김
// =====================================================
export async function updateRoleAction(
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  const id = formData.get("id") as string;
  const label = (formData.get("label") as string)?.trim();
  const defaultLevel = parseInt(formData.get("defaultLevel") as string, 10) || 0;
  const isAdminFlag = formData.get("isAdmin") === "on";
  const sortOrder = parseInt(formData.get("sortOrder") as string, 10) || 100;

  if (!id || !label) return { error: "필수 정보가 누락되었습니다." };

  const role = await prisma.staffRole.findUnique({ where: { id } });
  if (!role) return { error: "역할을 찾을 수 없습니다." };

  if (role.isSystem) {
    // 시스템 역할은 라벨/정렬만 변경 가능
    await prisma.staffRole.update({
      where: { id },
      data: { label, sortOrder },
    });
  } else {
    await prisma.staffRole.update({
      where: { id },
      data: { label, defaultLevel, isAdmin: isAdminFlag, sortOrder },
    });
  }

  revalidatePath("/admin/roles");
  revalidatePath("/admin/users/new");
  revalidatePath("/admin/users");
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

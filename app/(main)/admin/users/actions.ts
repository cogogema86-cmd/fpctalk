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

/** 권한 확인: 호출자가 관리 권한 역할인지 */
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
  if (!me.role.isAdmin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  return { ok: true };
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

  if (!isValidUsername(username)) {
    return { error: "아이디는 영문/숫자/_/- 3~20자여야 합니다." };
  }
  if (!name) return { error: "이름을 입력해주세요." };
  if (!roleId) return { error: "역할을 선택해주세요." };
  if (passwordInput && passwordInput.length < 6) {
    return { error: "비밀번호는 최소 6자 이상이어야 합니다." };
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
// 비밀번호 재설정 (관리자가 직원 비번 초기화)
// =====================================================
export type ResetPasswordResult = {
  error?: string;
  newPassword?: string;
  username?: string;
};

export async function resetPasswordAction(
  userId: string,
): Promise<ResetPasswordResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { authId: true, username: true },
  });
  if (!target) return { error: "직원을 찾을 수 없습니다." };

  const newPassword = generatePassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(target.authId, {
    password: newPassword,
  });

  if (error) return { error: `초기화 실패: ${error.message}` };

  return { newPassword, username: target.username };
}

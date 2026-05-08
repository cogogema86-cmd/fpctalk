"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { usernameToEmail } from "@/lib/auth";

export type ChangePasswordState = {
  error?: string;
  success?: string;
};

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "모든 필드를 입력해주세요." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "새 비밀번호와 확인이 일치하지 않습니다." };
  }
  if (newPassword.length < 6) {
    return { error: "새 비밀번호는 최소 6자 이상이어야 합니다." };
  }
  if (currentPassword === newPassword) {
    return { error: "기존 비밀번호와 동일합니다. 다른 비밀번호로 변경해주세요." };
  }

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { error: "로그인이 필요합니다." };

  const me = await prisma.user.findUnique({
    where: { authId: authUser.id },
    select: { username: true },
  });
  if (!me) return { error: "사용자 정보를 찾을 수 없습니다." };

  // 기존 비번 검증 — 같은 자격으로 다시 로그인 시도해서 확인
  const verify = await supabase.auth.signInWithPassword({
    email: usernameToEmail(me.username),
    password: currentPassword,
  });

  if (verify.error) {
    return { error: "기존 비밀번호가 올바르지 않습니다." };
  }

  // 비번 업데이트
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (error) return { error: `변경 실패: ${error.message}` };

  return { success: "비밀번호가 성공적으로 변경되었습니다." };
}

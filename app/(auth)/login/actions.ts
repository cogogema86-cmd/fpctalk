"use server";

import { createClient, REMEMBER_ME_COOKIE } from "@/lib/supabase/server";
import { usernameToEmail } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export type LoginState = {
  error?: string;
  debug?: string;
};

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = (formData.get("username") as string)?.trim();
  const password = formData.get("password") as string;
  const rememberMe = formData.get("rememberMe") === "1";

  if (!username || !password) {
    return { error: "아이디와 비밀번호를 입력해주세요." };
  }

  // rememberMe cookie를 먼저 설정 → 이후 createClient가 그 값을 읽어
  // Supabase auth cookie의 maxAge를 결정함
  const cookieStore = await cookies();
  if (rememberMe) {
    cookieStore.set(REMEMBER_ME_COOKIE, "1", {
      maxAge: 60 * 60 * 24 * 365, // 1년 (장기 저장 의도)
      path: "/",
      sameSite: "lax",
      httpOnly: false, // 클라이언트가 읽을 수 있게 (선택)
    });
  } else {
    cookieStore.delete(REMEMBER_ME_COOKIE);
  }

  const email = usernameToEmail(username);

  // 사용자에게 노출하는 에러는 일반화한다(계정 열거·내부정보 누출 방지).
  // 상세 원인은 서버 로그(console)로만 남겨 관리자가 Vercel 로그에서 확인.
  const GENERIC_AUTH_ERROR = "아이디 또는 비밀번호가 올바르지 않습니다.";
  const GENERIC_SERVER_ERROR =
    "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";

  let supabase;
  try {
    supabase = await createClient();
  } catch (e) {
    console.error("[login] createClient 실패:", e);
    return { error: GENERIC_SERVER_ERROR };
  }

  let signInResult;
  try {
    signInResult = await supabase.auth.signInWithPassword({ email, password });
  } catch (e) {
    console.error("[login] signIn 호출 자체 예외:", e);
    return { error: GENERIC_SERVER_ERROR };
  }

  const { error, data } = signInResult;
  console.log("[login] 결과:", {
    email,
    hasUser: !!data?.user,
    hasSession: !!data?.session,
    error: error?.message,
    errorStatus: error?.status,
  });

  if (error) {
    return { error: GENERIC_AUTH_ERROR };
  }

  if (!data?.session) {
    return { error: GENERIC_AUTH_ERROR };
  }

  // 비활성(퇴사) 계정이면 즉시 로그아웃 + 로그인 거부
  const dbUser = await prisma.user.findUnique({
    where: { authId: data.user.id },
    select: { active: true },
  });
  if (dbUser && !dbUser.active) {
    await supabase.auth.signOut();
    return { error: "비활성화된 계정입니다. 관리자에게 문의하세요." };
  }

  redirect("/chat");
}

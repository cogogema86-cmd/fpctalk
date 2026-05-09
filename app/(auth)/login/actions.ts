"use server";

import { createClient } from "@/lib/supabase/server";
import { usernameToEmail } from "@/lib/auth";
import { redirect } from "next/navigation";

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

  if (!username || !password) {
    return { error: "아이디와 비밀번호를 입력해주세요." };
  }

  const email = usernameToEmail(username);

  let supabase;
  try {
    supabase = await createClient();
  } catch (e) {
    console.error("[login] createClient 실패:", e);
    return {
      error: "서버 설정 오류 (createClient)",
      debug: e instanceof Error ? e.message : String(e),
    };
  }

  let signInResult;
  try {
    signInResult = await supabase.auth.signInWithPassword({ email, password });
  } catch (e) {
    console.error("[login] signIn 호출 자체 예외:", e);
    return {
      error: "Supabase 호출 실패",
      debug: e instanceof Error ? e.message : String(e),
    };
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
    return {
      error: `로그인 실패: ${error.message} (status ${error.status ?? "?"})`,
      debug: `email=${email}`,
    };
  }

  if (!data?.session) {
    return {
      error: "세션 생성 실패",
      debug: `user=${data?.user?.id ?? "none"}`,
    };
  }

  redirect("/chat");
}

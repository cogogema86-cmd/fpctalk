"use server";

import { createClient } from "@/lib/supabase/server";
import { usernameToEmail } from "@/lib/auth";
import { redirect } from "next/navigation";

export type LoginState = {
  error?: string;
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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });

  if (error) {
    // Supabase의 영문 에러를 한국어로 단순화
    const msg = error.message.toLowerCase();
    if (msg.includes("invalid login credentials") || msg.includes("invalid")) {
      return { error: "아이디 또는 비밀번호가 올바르지 않습니다." };
    }
    return { error: error.message };
  }

  redirect("/dashboard");
}

"use server";

import { createClient, REMEMBER_ME_COOKIE } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 명시적 logout 시 자동 로그인 플래그도 제거
  const cookieStore = await cookies();
  cookieStore.delete(REMEMBER_ME_COOKIE);
  redirect("/login");
}

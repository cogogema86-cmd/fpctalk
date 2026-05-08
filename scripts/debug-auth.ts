/**
 * 인증 디버그 스크립트
 * - admin 사용자 상태 조회
 * - 직접 로그인 시도해서 실제 에러 확인
 */
import { createClient } from "@supabase/supabase-js";
import { usernameToEmail } from "../lib/auth";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // 1. admin 사용자 상태 조회
  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("=== admin 사용자 상태 ===");
  const { data: list, error: listErr } = await adminClient.auth.admin.listUsers();
  if (listErr) {
    console.error("listUsers 에러:", listErr);
    return;
  }
  const adminUser = list.users.find(
    (u) => u.email === usernameToEmail("admin"),
  );
  if (!adminUser) {
    console.log("❌ admin 계정을 못 찾음!");
    console.log("전체 사용자 목록:");
    list.users.forEach((u) => console.log(`  - ${u.email} (id: ${u.id})`));
    return;
  }

  console.log(`✅ 발견: ${adminUser.email}`);
  console.log(`   id: ${adminUser.id}`);
  console.log(`   email_confirmed_at: ${adminUser.email_confirmed_at}`);
  console.log(`   confirmed_at: ${adminUser.confirmed_at}`);
  console.log(`   last_sign_in_at: ${adminUser.last_sign_in_at}`);
  console.log(`   created_at: ${adminUser.created_at}`);
  console.log(`   banned_until: ${adminUser.banned_until}`);

  // 2. 직접 로그인 시도 (anon key로)
  console.log("\n=== 로그인 시도 ===");
  const userClient = createClient(url, anonKey);
  const { data: loginData, error: loginErr } =
    await userClient.auth.signInWithPassword({
      email: usernameToEmail("admin"),
      password: process.env.ADMIN_PASSWORD || "41221002!@",
    });

  if (loginErr) {
    console.error("❌ 로그인 실패");
    console.error(`   message: ${loginErr.message}`);
    console.error(`   status: ${loginErr.status}`);
    console.error(`   code: ${(loginErr as { code?: string }).code}`);
    console.error(`   name: ${loginErr.name}`);
  } else {
    console.log("✅ 로그인 성공!");
    console.log(`   user.id: ${loginData.user?.id}`);
    console.log(`   session: ${loginData.session ? "있음" : "없음"}`);
  }
}

main().catch(console.error);

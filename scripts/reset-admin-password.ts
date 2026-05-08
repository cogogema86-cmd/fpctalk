/**
 * admin 비번 재설정 + 그 자리에서 로그인 검증
 */
import { createClient } from "@supabase/supabase-js";
import { usernameToEmail } from "../lib/auth";
import * as dotenv from "dotenv";

dotenv.config();

const NEW_PASSWORD = process.env.NEW_PASSWORD || "Fpctalk2026";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const email = usernameToEmail("admin");

  const adminClient = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 사용자 찾기
  const { data: list } = await adminClient.auth.admin.listUsers();
  const u = list?.users.find((x) => x.email === email);
  if (!u) {
    console.error("❌ admin 사용자 없음");
    return;
  }

  // 비번 업데이트
  console.log("⏳ 비번 재설정 중...");
  const { error } = await adminClient.auth.admin.updateUserById(u.id, {
    password: NEW_PASSWORD,
  });
  if (error) {
    console.error("❌ 업데이트 실패:", error.message);
    return;
  }
  console.log(`✅ admin 비번 재설정 완료: ${NEW_PASSWORD}`);

  // 즉시 로그인 검증
  const userClient = createClient(url, anon);
  const { error: loginErr } = await userClient.auth.signInWithPassword({
    email,
    password: NEW_PASSWORD,
  });

  if (loginErr) {
    console.error("❌ 새 비번 로그인 검증 실패:", loginErr.message);
  } else {
    console.log(`\n🎉 새 비번 로그인 검증 OK!`);
    console.log(`   브라우저에서 admin / ${NEW_PASSWORD} 로 로그인 가능`);
  }
}

main().catch(console.error);

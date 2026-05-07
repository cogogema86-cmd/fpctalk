/**
 * 첫 관리자(원장) 계정 생성 스크립트
 *
 * 실행:
 *   npx tsx scripts/setup-admin.ts
 *
 * 또는 환경변수로 입력:
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD=Pass123 ADMIN_NAME="김원장" npx tsx scripts/setup-admin.ts
 *
 * 인터랙티브 모드:
 *   인자 없이 실행하면 stdin으로 물어봄
 */

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { usernameToEmail, isValidUsername } from "../lib/auth";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import * as dotenv from "dotenv";

dotenv.config();

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

async function main() {
  const username =
    process.env.ADMIN_USERNAME || (await prompt("관리자 username: "));
  const password =
    process.env.ADMIN_PASSWORD || (await prompt("관리자 비밀번호: "));
  const name = process.env.ADMIN_NAME || (await prompt("이름: "));

  if (!isValidUsername(username)) {
    console.error("❌ username은 영문/숫자/_/- 3~20자여야 합니다.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("❌ 비밀번호는 8자 이상이어야 합니다.");
    process.exit(1);
  }

  // service_role로 Auth 생성
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const email = usernameToEmail(username);
  console.log(`\n📧 합성 이메일: ${email}`);

  // 이미 존재하는지 확인
  const prisma = new PrismaClient();
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.error(`❌ username "${username}"은 이미 존재합니다.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // Supabase Auth에 사용자 생성
  console.log("⏳ Supabase Auth 사용자 생성 중...");
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // 이메일 확인 단계 건너뛰기
    user_metadata: { username, name, role: "PRINCIPAL" },
  });

  if (authError || !authData.user) {
    console.error("❌ Auth 생성 실패:", authError?.message);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`✅ Auth 생성 완료 (id: ${authData.user.id})`);

  // DB User row 생성
  console.log("⏳ DB User 행 생성 중...");
  const dbUser = await prisma.user.create({
    data: {
      authId: authData.user.id,
      username,
      name,
      role: "PRINCIPAL",
      level: 3,
    },
  });

  console.log(`✅ DB User 생성 완료 (id: ${dbUser.id})`);
  console.log("\n🎉 관리자 계정 생성 완료!");
  console.log(`   로그인: ${username} / [입력하신 비밀번호]`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

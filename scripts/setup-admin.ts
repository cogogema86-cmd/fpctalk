/**
 * 첫 관리자(원장) 계정 생성/연결 스크립트 (idempotent)
 *
 * - Supabase Auth에 사용자 없으면: 생성
 * - 있으면: 비번 업데이트 (선택)
 * - DB User 행 없으면: 생성 (PRINCIPAL 역할)
 * - 있으면: 그대로 (수정 안 함)
 *
 * 실행:
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD=Pass123 ADMIN_NAME="김원장" npx tsx scripts/setup-admin.ts
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
  if (password.length < 6) {
    console.error("❌ 비밀번호는 6자 이상이어야 합니다.");
    process.exit(1);
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const email = usernameToEmail(username);
  console.log(`\n📧 합성 이메일: ${email}`);

  const prisma = new PrismaClient();

  // 1. PRINCIPAL 역할 찾기
  const principalRole = await prisma.staffRole.findUnique({
    where: { code: "PRINCIPAL" },
  });
  if (!principalRole) {
    console.error("❌ PRINCIPAL 역할이 없습니다. 먼저 seed-roles.ts 실행해주세요.");
    await prisma.$disconnect();
    process.exit(1);
  }

  // 2. Supabase Auth 사용자 확인/생성
  console.log("⏳ Supabase Auth 확인 중...");
  const { data: list } = await admin.auth.admin.listUsers();
  let authUser = list?.users.find((u) => u.email === email);

  if (authUser) {
    console.log(`  ℹ️  이미 존재 (id: ${authUser.id}) — 비번 갱신`);
    const { error } = await admin.auth.admin.updateUserById(authUser.id, {
      password,
    });
    if (error) {
      console.error("❌ 비번 업데이트 실패:", error.message);
      await prisma.$disconnect();
      process.exit(1);
    }
    console.log("  ✓ 비번 업데이트 완료");
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, name, role: "PRINCIPAL" },
    });
    if (error || !data.user) {
      console.error("❌ Auth 생성 실패:", error?.message);
      await prisma.$disconnect();
      process.exit(1);
    }
    authUser = data.user;
    console.log(`  ✓ Auth 새로 생성 (id: ${authUser.id})`);
  }

  // 3. DB User 확인/생성
  const existingUser = await prisma.user.findUnique({
    where: { authId: authUser.id },
  });

  if (existingUser) {
    console.log(`  ℹ️  DB User 이미 존재 — 그대로 둠`);
  } else {
    const dbUser = await prisma.user.create({
      data: {
        authId: authUser.id,
        username,
        name,
        roleId: principalRole.id,
        level: principalRole.defaultLevel,
      },
    });
    console.log(`  ✓ DB User 생성 (id: ${dbUser.id})`);
  }

  console.log("\n🎉 관리자 계정 준비 완료!");
  console.log(`   로그인: ${username} / [입력하신 비밀번호]`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

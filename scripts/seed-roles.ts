/**
 * 시스템 기본 6개 역할 seed (idempotent — 여러 번 실행 OK)
 *
 * 실행: npx tsx scripts/seed-roles.ts
 */
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const SYSTEM_ROLES = [
  { code: "PRINCIPAL", label: "admin",    defaultLevel: 3, isAdmin: true,  sortOrder: 0  },
  { code: "VICE",      label: "부원장",   defaultLevel: 2, isAdmin: true,  sortOrder: 10 },
  { code: "TEACHER",   label: "강사",     defaultLevel: 1, isAdmin: false, sortOrder: 20 },
  { code: "ASSISTANT", label: "동승",     defaultLevel: 0, isAdmin: false, sortOrder: 30 },
  { code: "DRIVER",    label: "기사",     defaultLevel: 0, isAdmin: false, sortOrder: 40 },
  { code: "STAFF",     label: "일반 직원", defaultLevel: 0, isAdmin: false, sortOrder: 50 },
];

async function main() {
  const prisma = new PrismaClient();
  console.log("⏳ 기본 역할 seed 중...");

  for (const r of SYSTEM_ROLES) {
    const role = await prisma.staffRole.upsert({
      where: { code: r.code },
      create: { ...r, isSystem: true },
      update: {
        // 시스템 역할은 라벨/정렬은 갱신하되, isSystem/isAdmin은 그대로
        label: r.label,
        sortOrder: r.sortOrder,
      },
    });
    console.log(`  ✓ ${role.code.padEnd(10)} → ${role.label} (level ${role.defaultLevel}, admin=${role.isAdmin})`);
  }

  const total = await prisma.staffRole.count();
  console.log(`\n✅ 완료. 현재 등록된 역할 ${total}개`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

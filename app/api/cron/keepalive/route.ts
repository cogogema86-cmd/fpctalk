/**
 * Supabase 무료 플랜 자동 일시정지 방지 — DB keepalive
 * GET /api/cron/keepalive
 *
 * 배경:
 * - Supabase 무료 프로젝트는 7일간 요청이 전혀 없으면 자동 일시정지됨
 *   → 학원이 일주일간 앱을 안 쓰면 DB가 멈춰 채팅·로그인 전부 안 됨
 * - 매일 가벼운 DB 조회를 한 번 보내면 "비활성" 타이머가 리셋되어 정지 안 됨
 *
 * 호출자:
 * - Vercel Cron (vercel.json — 매일 UTC 00:00 = KST 09:00)
 * - 외부 핑 서비스(cron-job.org 등)로도 호출 가능 (Vercel 무료 cron이 불안정할 때 백업)
 *
 * 동작: 메시지를 만들지 않고 가벼운 SELECT만 수행 (채팅방을 더럽히지 않음).
 * 민감 정보 미반환 + 변경 없음이라 공개 호출돼도 안전.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  // 인증: CRON_SECRET이 설정돼 있으면 요구한다.
  // - Vercel Cron: Authorization: Bearer <secret> 헤더 자동 부착
  // - 외부 핑(cron-job.org 등): URL에 ?key=<secret> 추가
  // CRON_SECRET 미설정이면 공개 허용(읽기 전용·무해) — 설정 전까진 핑이 안 끊김.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const fromVercelCron = req.headers.get("user-agent")?.includes("vercel-cron");
  if (secret) {
    const queryKey = new URL(req.url).searchParams.get("key");
    const headerOk = auth === `Bearer ${secret}`;
    const queryOk = queryKey === secret;
    if (!headerOk && !queryOk) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // 가벼운 DB 왕복 — 이 요청 자체가 Supabase 활성 신호가 됨
    // (공개 호출 가능 엔드포인트이므로 사용자 수 등 내부 정보는 노출하지 않음)
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      ts: new Date().toISOString(),
      via: fromVercelCron ? "vercel-cron" : "external",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "DB error" },
      { status: 500 },
    );
  }
}

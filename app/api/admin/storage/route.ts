/**
 * 저장공간(R2) 사용량 조회 — 권한(canViewStorage) 있는 관리자만.
 * GET /api/admin/storage
 *
 * R2 버킷의 객체를 합산해 총 사용량 + 종류별 분류를 반환.
 * 무료 한도(10GB) 대비 표시는 클라이언트(대시보드 카드)에서 처리.
 */
import { NextResponse } from "next/server";
import { canAccessFeature } from "@/lib/permissions";
import { getR2Usage } from "@/lib/storage-r2";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cloudflare R2 무료 한도 (10GB)
const FREE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;

export async function GET() {
  const allowed = await canAccessFeature("storage");
  if (!allowed) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const provider = process.env.STORAGE_PROVIDER || "supabase";
  if (provider !== "r2") {
    return NextResponse.json(
      { error: "현재 스토리지(R2)가 아니어서 사용량을 집계할 수 없습니다.", provider },
      { status: 400 },
    );
  }

  try {
    const usage = await getR2Usage();
    return NextResponse.json({
      ok: true,
      totalBytes: usage.totalBytes,
      objectCount: usage.objectCount,
      byPrefix: usage.byPrefix,
      limitBytes: FREE_LIMIT_BYTES,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "사용량 조회 실패" },
      { status: 500 },
    );
  }
}

/**
 * 만료된 채팅 첨부 자동 정리
 * GET /api/cron/cleanup-attachments
 *
 * 호출자:
 * - Vercel Cron (vercel.json crons에 등록 — 매일 UTC 16:00 = KST 01:00)
 *   Vercel가 자동으로 Authorization: Bearer ${CRON_SECRET} 헤더 부착
 * - 수동: Authorization: Bearer ${CRON_SECRET} 으로 직접 호출 가능
 *
 * 동작:
 * 1. type=IMAGE/FILE 메시지 중 metadata.attachment.expiresAt < 현재 시각인 것 수집
 * 2. R2(또는 STORAGE_PROVIDER)에서 파일 삭제
 * 3. 메시지 metadata를 expired 마커로 교체 (메시지 자체는 보존 — 답글·검색 깨지지 않게)
 *    content는 "[만료된 첨부파일]"로 변경
 *
 * 보관 정책:
 * - 이미지: 365일
 * - 동영상: 60일
 * (위 정책은 업로드 시 metadata.attachment.expiresAt에 박힘 — 이 cron은 그 값만 신뢰)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteFiles, getActiveStorageType } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Att = {
  kind?: string;
  path?: string;
  expiresAt?: string;
  expired?: boolean;
  name?: string;
};

export async function GET(req: Request) {
  // 인증: CRON_SECRET 환경변수가 설정돼 있으면 Bearer 검증
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }
  }
  // CRON_SECRET 미설정이면 — Vercel Cron 호출 신뢰 (Vercel 환경에서만 호출되므로)

  const now = new Date();
  const nowIso = now.toISOString();

  // 첨부 메시지 후보 수집
  const candidates = await prisma.message.findMany({
    where: { type: { in: ["IMAGE", "FILE"] } },
    select: { id: true, metadata: true },
  });

  type ToDelete = { msgId: string; path: string; name: string; kind: string };
  const toDelete: ToDelete[] = [];

  for (const m of candidates) {
    const meta = (m.metadata ?? {}) as { attachment?: Att };
    const a = meta.attachment;
    if (!a) continue;
    if (a.expired) continue;
    if (!a.path || !a.expiresAt) continue;
    if (a.expiresAt > nowIso) continue;
    toDelete.push({
      msgId: m.id,
      path: a.path,
      name: a.name ?? "attachment",
      kind: a.kind ?? "file",
    });
  }

  if (toDelete.length === 0) {
    return NextResponse.json({
      ok: true,
      ranAt: nowIso,
      checked: candidates.length,
      deleted: 0,
    });
  }

  // R2 등에서 파일 삭제 (배치)
  const storageType = getActiveStorageType();
  const paths = toDelete.map((d) => d.path);
  let storageError: string | null = null;
  try {
    await deleteFiles(storageType, paths);
  } catch (e) {
    storageError = e instanceof Error ? e.message : "삭제 실패";
    // 그래도 DB metadata는 갱신 — orphan 파일은 R2에 남지만 사용자에겐 만료 처리됨
  }

  // 메시지 metadata 갱신 (메시지 자체는 보존)
  let dbUpdated = 0;
  for (const d of toDelete) {
    try {
      await prisma.message.update({
        where: { id: d.msgId },
        data: {
          content: "[만료된 첨부파일]",
          metadata: {
            attachment: {
              kind: d.kind,
              name: d.name,
              expired: true,
              expiredAt: nowIso,
            },
          } as object,
        },
      });
      dbUpdated += 1;
    } catch (e) {
      console.error(
        `[cron cleanup] DB 업데이트 실패 msgId=${d.msgId}:`,
        e,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: nowIso,
    checked: candidates.length,
    deleted: toDelete.length,
    dbUpdated,
    storageError,
  });
}

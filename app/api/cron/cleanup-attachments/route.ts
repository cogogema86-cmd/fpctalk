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
  expiredAt?: string;
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
    select: { id: true, metadata: true, content: true },
  });

  // 만료된 첨부가 하나라도 있어 metadata를 갱신해야 하는 메시지 단위로 모음.
  // 첨부별 expiresAt이 다를 수 있어(이미지 365일 vs 파일 90일) 부분 만료를 지원한다.
  type Rebuild = {
    msgId: string;
    nextAttachments: Att[];
    allExpired: boolean;
  };
  const rebuilds: Rebuild[] = [];
  const pathsToDelete: string[] = [];

  for (const m of candidates) {
    const meta = (m.metadata ?? {}) as {
      attachment?: Att;
      attachments?: Att[];
    };
    // 단일/다중 정규화
    const list = Array.isArray(meta.attachments)
      ? meta.attachments
      : meta.attachment
        ? [meta.attachment]
        : [];
    if (list.length === 0) continue;

    let changed = false;
    const next: Att[] = list.map((a) => {
      if (a.expired) return a; // 이미 만료 처리됨
      if (!a.path || !a.expiresAt) return a;
      if (a.expiresAt > nowIso) return a; // 아직 유효
      // 만료 → 삭제 대상 + 만료 마커로 교체
      changed = true;
      pathsToDelete.push(a.path);
      return {
        kind: a.kind ?? "file",
        name: a.name ?? "attachment",
        expired: true,
        expiredAt: nowIso,
      } as Att;
    });

    if (!changed) continue;
    const allExpired = next.every((a) => a.expired);
    rebuilds.push({ msgId: m.id, nextAttachments: next, allExpired });
  }

  if (rebuilds.length === 0) {
    return NextResponse.json({
      ok: true,
      ranAt: nowIso,
      checked: candidates.length,
      deleted: 0,
    });
  }

  // R2 등에서 파일 삭제 (배치)
  const storageType = getActiveStorageType();
  let storageError: string | null = null;
  try {
    await deleteFiles(storageType, pathsToDelete);
  } catch (e) {
    storageError = e instanceof Error ? e.message : "삭제 실패";
    // 그래도 DB metadata는 갱신 — orphan 파일은 R2에 남지만 사용자에겐 만료 처리됨
  }

  // 메시지 metadata 갱신 (메시지 자체는 보존)
  let dbUpdated = 0;
  for (const r of rebuilds) {
    try {
      await prisma.message.update({
        where: { id: r.msgId },
        data: {
          // 모든 첨부가 만료된 경우에만 본문을 만료 표시로 교체 (부분 만료는 본문 보존)
          ...(r.allExpired ? { content: "[만료된 첨부파일]" } : {}),
          metadata: { attachments: r.nextAttachments } as object,
        },
      });
      dbUpdated += 1;
    } catch (e) {
      console.error(
        `[cron cleanup] DB 업데이트 실패 msgId=${r.msgId}:`,
        e,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: nowIso,
    checked: candidates.length,
    deleted: pathsToDelete.length,
    dbUpdated,
    storageError,
  });
}

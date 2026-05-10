/**
 * 채팅 첨부 파일 업로드
 * POST /api/chat/[chatId]/upload  (multipart/form-data, field "file")
 *
 * 검증:
 * - 채팅 멤버여야 함 (또는 레벨 충족)
 * - mime: image/* 또는 video/* 만 허용 (Phase 1)
 * - size: 이미지 ≤ 10MB, 동영상 ≤ 30MB
 *
 * 응답:
 * - { ok: true, attachment: AttachmentMeta }
 *   - kind: image / video
 *   - path: R2 key
 *   - mime, size, name
 *   - expiresAt: 이미지=1년, 동영상=60일
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";
import { uploadFile, getActiveStorageType } from "@/lib/storage";
import { randomUUID } from "node:crypto";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_BYTES = 30 * 1024 * 1024; // 30MB

const IMAGE_RETENTION_DAYS = 365;
const VIDEO_RETENTION_DAYS = 60;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ chatId: string }> },
) {
  const me = await getMe();
  if (!me) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }
  const { chatId } = await ctx.params;

  // 권한: 멤버이거나 레벨 채팅 자격 충족
  const isMember = await prisma.chatMember.findFirst({
    where: { chatId, userId: me.id },
    select: { id: true },
  });
  if (!isMember) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { levelRequired: true },
    });
    if (!chat || chat.levelRequired === null) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }
    const u = await prisma.user.findUnique({
      where: { id: me.id },
      select: { role: { select: { defaultLevel: true } } },
    });
    if ((u?.role.defaultLevel ?? 0) < chat.levelRequired) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "파일이 없습니다." },
      { status: 400 },
    );
  }

  const mime = file.type || "application/octet-stream";
  let kind: "image" | "video" | "file";
  let maxBytes: number;
  let retentionDays: number;
  if (mime.startsWith("image/")) {
    kind = "image";
    maxBytes = MAX_IMAGE_BYTES;
    retentionDays = IMAGE_RETENTION_DAYS;
  } else if (mime.startsWith("video/")) {
    kind = "video";
    maxBytes = MAX_VIDEO_BYTES;
    retentionDays = VIDEO_RETENTION_DAYS;
  } else {
    // Phase 1: 이미지/동영상만
    return NextResponse.json(
      { error: "이미지/동영상 파일만 첨부할 수 있습니다." },
      { status: 415 },
    );
  }

  if (file.size > maxBytes) {
    const limitMb = Math.round(maxBytes / 1024 / 1024);
    return NextResponse.json(
      { error: `파일이 너무 큽니다 (최대 ${limitMb}MB)` },
      { status: 413 },
    );
  }

  // 파일명 sanitize — 확장자만 보존
  const origName = file.name || "attachment";
  const extMatch = origName.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : "";
  const safeName = origName
    .replace(/[\\/]/g, "_")
    .replace(/[^\w.\- ]/g, "")
    .slice(0, 120) || "attachment";

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageType = getActiveStorageType();
  const key = `chat/${chatId}/${randomUUID()}${ext ? `.${ext}` : ""}`;

  let storagePath: string;
  try {
    const r = await uploadFile({
      storageType,
      path: key,
      fileName: safeName,
      buffer,
      mimeType: mime,
    });
    storagePath = r.storagePath;
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "업로드 실패",
      },
      { status: 500 },
    );
  }

  const expiresAt = new Date(
    Date.now() + retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  return NextResponse.json({
    ok: true,
    attachment: {
      kind,
      path: storagePath,
      mime,
      size: file.size,
      name: safeName,
      expiresAt,
    },
  });
}

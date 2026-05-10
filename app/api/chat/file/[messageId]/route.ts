/**
 * 채팅 첨부 파일 표시/다운로드 — signed URL redirect
 * GET /api/chat/file/[messageId]
 *
 * 권한: 메시지의 채팅 멤버 (또는 레벨 자격) 이어야 접근 가능.
 * 동작: R2 등의 signed URL 발급 후 302 redirect. 브라우저가 직접 가져감.
 *       img/video src에 그대로 사용 가능.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";
import { getDirectSignedUrl, downloadFile } from "@/lib/storage";

type AttachmentMeta = {
  kind?: string;
  path?: string;
  mime?: string;
  name?: string;
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ messageId: string }> },
) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const { messageId } = await ctx.params;

  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      chatId: true,
      type: true,
      metadata: true,
    },
  });
  if (!msg) {
    return NextResponse.json({ error: "메시지 없음" }, { status: 404 });
  }
  if (msg.type !== "IMAGE" && msg.type !== "FILE") {
    return NextResponse.json({ error: "첨부 없음" }, { status: 404 });
  }

  // 권한: 채팅 멤버 또는 레벨 채팅 자격
  const isMember = await prisma.chatMember.findFirst({
    where: { chatId: msg.chatId, userId: me.id },
    select: { id: true },
  });
  if (!isMember) {
    const chat = await prisma.chat.findUnique({
      where: { id: msg.chatId },
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

  const meta = (msg.metadata ?? {}) as { attachment?: AttachmentMeta };
  const a = meta.attachment;
  if (!a?.path) {
    return NextResponse.json({ error: "첨부 경로 없음" }, { status: 404 });
  }

  // R2 등은 signed URL이 있으면 redirect.
  // (Drive 등은 직접 URL이 없어 fallback 스트리밍)
  const url = new URL(_req.url);
  const isDownload = url.searchParams.get("download") === "1";
  const provider = process.env.STORAGE_PROVIDER || "supabase";
  const storageType = (
    provider === "r2" ? "r2" : provider === "drive" ? "drive" : "supabase"
  ) as "supabase" | "r2" | "drive";

  const signed = await getDirectSignedUrl(storageType, a.path, 3600).catch(
    () => null,
  );
  if (signed) {
    if (isDownload) {
      // download 강제: 별도 헤더로 스트리밍
      const buf = await downloadFile(storageType, a.path).catch(() => null);
      if (!buf) {
        return NextResponse.redirect(signed, 302);
      }
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": a.mime ?? "application/octet-stream",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.name ?? "attachment")}`,
          "Cache-Control": "private, max-age=300",
        },
      });
    }
    return NextResponse.redirect(signed, 302);
  }

  // signed URL 미지원 (Drive 등) — 직접 스트리밍
  const buf = await downloadFile(storageType, a.path).catch(() => null);
  if (!buf) {
    return NextResponse.json({ error: "파일을 가져올 수 없습니다." }, { status: 500 });
  }
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": a.mime ?? "application/octet-stream",
      ...(isDownload
        ? {
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.name ?? "attachment")}`,
          }
        : {}),
      "Cache-Control": "private, max-age=300",
    },
  });
}

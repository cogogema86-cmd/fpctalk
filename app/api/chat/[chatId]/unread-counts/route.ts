/**
 * 채팅방 메시지별 안 읽은 인원수 조회 (폴링용)
 * GET /api/chat/[chatId]/unread-counts → { [messageId]: number }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeUnreadCounts, getMe } from "@/lib/chat";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ chatId: string }> },
) {
  const me = await getMe();
  if (!me) return NextResponse.json({}, { status: 401 });

  const { chatId } = await ctx.params;

  // 멤버 여부 확인
  const isMember = await prisma.chatMember.findFirst({
    where: { chatId, userId: me.id },
    select: { id: true },
  });
  if (!isMember) {
    // 레벨 채팅 자격 확인
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { levelRequired: true },
    });
    if (!chat || chat.levelRequired === null) {
      return NextResponse.json({}, { status: 403 });
    }
    const u = await prisma.user.findUnique({
      where: { id: me.id },
      select: { role: { select: { defaultLevel: true } } },
    });
    if ((u?.role.defaultLevel ?? 0) < chat.levelRequired) {
      return NextResponse.json({}, { status: 403 });
    }
  }

  // 본인이 발송한 메시지만 unread 계산 (다른 메시지는 0으로 간주)
  const myMessages = await prisma.message.findMany({
    where: { chatId, userId: me.id },
    select: { id: true, userId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 100, // 최근 100개만
  });

  const counts = await computeUnreadCounts(chatId, myMessages);
  return NextResponse.json(counts);
}

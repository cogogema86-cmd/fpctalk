/**
 * 배지 카운트 (BadgeSync 폴링용)
 * GET /api/badges → { chat: number, signs: number }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { countChatUnread, getMe } from "@/lib/chat";

export async function GET() {
  const me = await getMe();
  if (!me) return NextResponse.json({ chat: 0, signs: 0 }, { status: 401 });

  const [chat, signs] = await Promise.all([
    countChatUnread(me.id),
    prisma.signatureRequest.count({
      where: { signerId: me.id, status: "PENDING" },
    }),
  ]);

  return NextResponse.json({ chat, signs });
}

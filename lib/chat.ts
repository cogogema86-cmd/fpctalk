/**
 * 채팅 데이터 액세스 헬퍼 (서버 전용)
 *
 * 권한: 항상 호출자(authUser → DB User)를 기반으로 본인 채팅만 조작
 */
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

/** 현재 로그인 사용자 (DB User) — 채팅 함수의 인증 진입점 */
export async function getMe() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;
  return prisma.user.findUnique({
    where: { authId: authUser.id },
    select: { id: true, username: true, name: true },
  });
}

// =====================================================
// 내 채팅방 목록 (마지막 메시지/시간/안 읽은 수 포함)
// =====================================================
export async function getMyChats(userId: string) {
  const memberships = await prisma.chatMember.findMany({
    where: { userId },
    include: {
      chat: {
        include: {
          members: {
            include: {
              user: {
                select: { id: true, username: true, name: true },
              },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              content: true,
              type: true,
              createdAt: true,
              userId: true,
            },
          },
        },
      },
    },
  });

  // 채팅방을 마지막 메시지 시각순으로 정렬
  const items = memberships.map((m) => {
    const lastMessage = m.chat.messages[0] ?? null;
    const otherMembers = m.chat.members
      .filter((cm) => cm.userId !== userId)
      .map((cm) => cm.user);
    // 1:1이면 상대방 이름, 그룹이면 chat.name (없으면 멤버 이름들)
    const title =
      m.chat.type === "DM"
        ? otherMembers[0]?.name ?? "(상대 없음)"
        : m.chat.name ?? otherMembers.map((u) => u.name).join(", ");

    const unread =
      lastMessage && (!m.lastReadAt || lastMessage.createdAt > m.lastReadAt)
        ? 1 // 정확한 카운트는 별도 쿼리 필요. 여기선 0/1만.
        : 0;

    return {
      chatId: m.chatId,
      type: m.chat.type,
      title,
      otherMembers,
      lastMessage,
      unread,
      lastReadAt: m.lastReadAt,
    };
  });

  items.sort((a, b) => {
    const ta = a.lastMessage?.createdAt.getTime() ?? 0;
    const tb = b.lastMessage?.createdAt.getTime() ?? 0;
    return tb - ta;
  });

  return items;
}

// =====================================================
// 1:1 DM 가져오기/생성 (둘 다 멤버인 DM이 이미 있으면 그것 반환)
// =====================================================
export async function createOrGetDM(myUserId: string, otherUserId: string) {
  if (myUserId === otherUserId) {
    throw new Error("자기 자신과는 채팅할 수 없습니다.");
  }

  // 둘 다 멤버인 DM 채팅 검색
  const existingMine = await prisma.chatMember.findMany({
    where: { userId: myUserId, chat: { type: "DM" } },
    select: { chatId: true },
  });
  const myChatIds = existingMine.map((m) => m.chatId);

  if (myChatIds.length > 0) {
    const shared = await prisma.chat.findFirst({
      where: {
        id: { in: myChatIds },
        type: "DM",
        members: { some: { userId: otherUserId } },
      },
      select: { id: true },
    });
    if (shared) return shared.id;
  }

  // 새 DM 생성
  const chat = await prisma.chat.create({
    data: {
      type: "DM",
      members: {
        create: [{ userId: myUserId }, { userId: otherUserId }],
      },
    },
    select: { id: true },
  });
  return chat.id;
}

// =====================================================
// 특정 채팅의 메시지 목록 (오래된 → 최신)
// =====================================================
export async function getChatMessages(chatId: string, userId: string) {
  // 권한 체크
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });
  if (!member) throw new Error("이 채팅의 멤버가 아닙니다.");

  const messages = await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, username: true, name: true } },
    },
    take: 200, // 페이징은 추후 추가
  });
  return messages;
}

// =====================================================
// 채팅방 정보 (헤더 표시용)
// =====================================================
export async function getChatInfo(chatId: string, userId: string) {
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });
  if (!member) return null;

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      members: {
        include: {
          user: { select: { id: true, username: true, name: true } },
        },
      },
    },
  });
  if (!chat) return null;

  const others = chat.members
    .filter((m) => m.userId !== userId)
    .map((m) => m.user);
  const title =
    chat.type === "DM"
      ? others[0]?.name ?? "(상대 없음)"
      : chat.name ?? others.map((u) => u.name).join(", ");

  return { ...chat, title, otherMembers: others };
}

// =====================================================
// 메시지 전송
// =====================================================
export async function sendMessage(
  chatId: string,
  userId: string,
  content: string,
) {
  // 권한 체크
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });
  if (!member) throw new Error("이 채팅의 멤버가 아닙니다.");

  const trimmed = content.trim();
  if (!trimmed) throw new Error("메시지가 비어있습니다.");
  if (trimmed.length > 4000) throw new Error("메시지가 너무 깁니다 (4000자 제한).");

  return prisma.message.create({
    data: {
      chatId,
      userId,
      type: "TEXT",
      content: trimmed,
    },
    include: {
      user: { select: { id: true, username: true, name: true } },
    },
  });
}

// =====================================================
// 읽음 표시 갱신
// =====================================================
export async function markAsRead(chatId: string, userId: string) {
  await prisma.chatMember.update({
    where: { chatId_userId: { chatId, userId } },
    data: { lastReadAt: new Date() },
  });
}

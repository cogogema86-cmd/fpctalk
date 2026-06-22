/**
 * 채팅 데이터 액세스 헬퍼 (서버 전용)
 *
 * 채팅 종류:
 *  - DM (1:1)             : ChatMember 명시 멤버 2명
 *  - GROUP (명시 멤버)     : ChatMember 명시 멤버 N명
 *  - 레벨 채팅 (GROUP+levelRequired) : 멤버 명시 안 함, role.defaultLevel >= levelRequired면 자동 공개
 *
 * 권한 검증 패턴:
 *  - canAccess(chatId, userId): 채팅 접근 가능 여부 (멤버이거나, 레벨 충족)
 *  - 레벨 채팅 첫 진입 시 자동으로 ChatMember 생성 (lastReadAt 추적용)
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

async function getMyLevel(userId: string): Promise<number> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: { select: { defaultLevel: true } } },
  });
  return u?.role.defaultLevel ?? 0;
}

async function isUserAdmin(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: { select: { isAdmin: true } } },
  });
  return !!u?.role.isAdmin;
}

/**
 * 채팅 접근 가능 여부:
 *  - 명시 멤버이거나
 *  - 레벨 채팅이고 user.role.defaultLevel >= chat.levelRequired
 */
async function canAccess(
  chatId: string,
  userId: string,
): Promise<{ ok: true; isMember: boolean } | { ok: false }> {
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });
  if (member) return { ok: true, isMember: true };

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { levelRequired: true },
  });
  if (!chat || chat.levelRequired === null) return { ok: false };

  const myLevel = await getMyLevel(userId);
  if (myLevel >= chat.levelRequired) return { ok: true, isMember: false };
  return { ok: false };
}

/** 레벨 채팅 첫 진입 시 ChatMember 자동 upsert (멤버십 + lastReadAt 추적용) */
async function ensureMembership(chatId: string, userId: string) {
  await prisma.chatMember.upsert({
    where: { chatId_userId: { chatId, userId } },
    create: { chatId, userId },
    update: {},
  });
}

/** 폴링용 가벼운 권한 체크 (canAccess와 같지만 ensureMembership는 안 함) */
export async function canAccessForPolling(
  chatId: string,
  userId: string,
): Promise<boolean> {
  const r = await canAccess(chatId, userId);
  return r.ok;
}

// =====================================================
// 내 채팅방 목록 (멤버십 + 레벨 채팅 합쳐서 반환)
// =====================================================
export async function getMyChats(userId: string) {
  const myLevel = await getMyLevel(userId);

  // 1) 명시적 멤버십 채팅 (DM, GROUP, 그리고 이미 진입한 레벨 채팅)
  const memberships = await prisma.chatMember.findMany({
    where: { userId },
    include: {
      chat: {
        include: {
          members: {
            include: {
              user: { select: { id: true, username: true, name: true } },
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

  const memberChatIds = new Set(memberships.map((m) => m.chatId));

  // 2) 레벨 충족 + 아직 진입 안 한 레벨 채팅
  const levelChats = await prisma.chat.findMany({
    where: {
      levelRequired: { not: null, lte: myLevel },
      id: { notIn: [...memberChatIds] },
    },
    include: {
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
  });

  // 3) 각 채팅별 unread count 계산 (멤버십 기준 lastReadAt)
  // 레벨 채팅 중 아직 멤버십 없는 건 모든 메시지가 unread
  const unreadCounts = new Map<string, number>();

  // 멤버십 있는 채팅 — lastReadAt 이후 + 본인 메시지 제외
  for (const m of memberships) {
    if (m.chat.messages.length === 0) {
      unreadCounts.set(m.chatId, 0);
      continue;
    }
    const lastMsg = m.chat.messages[0];
    if (m.lastReadAt && lastMsg.createdAt <= m.lastReadAt) {
      unreadCounts.set(m.chatId, 0);
      continue;
    }
    const cnt = await prisma.message.count({
      where: {
        chatId: m.chatId,
        userId: { not: userId },
        ...(m.lastReadAt
          ? { createdAt: { gt: m.lastReadAt } }
          : {}),
      },
    });
    unreadCounts.set(m.chatId, cnt);
  }

  // 레벨 채팅 (멤버십 없음) — 본인 메시지 제외 전체
  for (const lc of levelChats) {
    if (lc.messages.length === 0) {
      unreadCounts.set(lc.id, 0);
      continue;
    }
    const cnt = await prisma.message.count({
      where: {
        chatId: lc.id,
        userId: { not: userId },
      },
    });
    unreadCounts.set(lc.id, cnt);
  }

  // 4) 통합 리스트 빌드
  const items = [
    ...memberships.map((m) => {
      const lastMessage = m.chat.messages[0] ?? null;
      const otherMembers = m.chat.members
        .filter((cm) => cm.userId !== userId)
        .map((cm) => cm.user);
      const title =
        m.chat.type === "DM"
          ? otherMembers[0]?.name ?? "(상대 없음)"
          : m.chat.name ?? otherMembers.map((u) => u.name).join(", ");
      return {
        chatId: m.chatId,
        type: m.chat.type as "DM" | "GROUP",
        title,
        otherMembers,
        lastMessage,
        unread: unreadCounts.get(m.chatId) ?? 0,
        lastReadAt: m.lastReadAt,
        levelRequired: m.chat.levelRequired,
        isLevelChat: m.chat.levelRequired !== null,
      };
    }),
    ...levelChats.map((lc) => ({
      chatId: lc.id,
      type: lc.type as "DM" | "GROUP",
      title: lc.name ?? `레벨 ${lc.levelRequired}+ 채팅`,
      otherMembers: [],
      lastMessage: lc.messages[0] ?? null,
      unread: unreadCounts.get(lc.id) ?? 0,
      lastReadAt: null,
      levelRequired: lc.levelRequired,
      isLevelChat: true,
    })),
  ];

  items.sort((a, b) => {
    const ta = a.lastMessage?.createdAt.getTime() ?? 0;
    const tb = b.lastMessage?.createdAt.getTime() ?? 0;
    return tb - ta;
  });

  return items;
}

/** 본인 unread 메시지 총합 (사이드바 배지/탭 title용) */
export async function countChatUnread(userId: string): Promise<number> {
  const items = await getMyChats(userId);
  return items.reduce((s, c) => s + c.unread, 0);
}

// =====================================================
// 그룹 채팅 생성 (명시 멤버 또는 레벨 기반)
// =====================================================
export type CreateGroupParams = {
  name: string;
  myUserId: string;
} & (
  | { mode: "members"; memberIds: string[] }
  | { mode: "level"; levelRequired: number }
);

export async function createGroupChat(params: CreateGroupParams) {
  const trimmed = params.name.trim();
  if (!trimmed) throw new Error("그룹 이름을 입력해주세요.");
  if (trimmed.length > 50)
    throw new Error("그룹 이름은 50자 이하로 입력해주세요.");

  if (params.mode === "level") {
    // 관리자만 레벨 채팅 생성 가능
    if (!(await isUserAdmin(params.myUserId))) {
      throw new Error("레벨 기반 채팅은 관리자만 생성할 수 있습니다.");
    }
    if (
      !Number.isFinite(params.levelRequired) ||
      params.levelRequired < 0 ||
      params.levelRequired > 99
    ) {
      throw new Error("레벨은 0~99 사이의 숫자여야 합니다.");
    }
    const chat = await prisma.chat.create({
      data: {
        type: "GROUP",
        name: trimmed,
        levelRequired: params.levelRequired,
        createdById: params.myUserId,
        // 생성자는 ChatMember로 자동 가입 (lastReadAt 추적용)
        members: {
          create: [{ userId: params.myUserId }],
        },
      },
      select: { id: true },
    });
    return chat.id;
  }

  // mode: members (기존 동작)
  const allMembers = [...new Set([params.myUserId, ...params.memberIds])];
  if (allMembers.length < 3) {
    throw new Error("그룹 채팅은 본인 포함 최소 3명이어야 합니다.");
  }
  const found = await prisma.user.count({
    where: { id: { in: allMembers } },
  });
  if (found !== allMembers.length) {
    throw new Error("일부 멤버를 찾을 수 없습니다.");
  }
  const chat = await prisma.chat.create({
    data: {
      type: "GROUP",
      name: trimmed,
      createdById: params.myUserId,
      members: {
        create: allMembers.map((userId) => ({ userId })),
      },
    },
    select: { id: true },
  });
  return chat.id;
}

// =====================================================
// 1:1 DM 가져오기/생성
// =====================================================
export async function createOrGetDM(myUserId: string, otherUserId: string) {
  if (myUserId === otherUserId) {
    throw new Error("자기 자신과는 채팅할 수 없습니다.");
  }
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
// 메시지 목록 조회
// =====================================================
export async function getChatMessages(chatId: string, userId: string) {
  const access = await canAccess(chatId, userId);
  if (!access.ok) throw new Error("이 채팅에 접근 권한이 없습니다.");

  // 레벨 채팅이고 아직 멤버 아니면 자동 가입 (lastReadAt 추적 시작)
  if (!access.isMember) {
    await ensureMembership(chatId, userId);
  }

  const messages = await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, username: true, name: true } },
    },
    take: 200,
  });
  return messages;
}

/**
 * 메시지마다 "안 읽은 인원수" 계산해서 반환 — 카카오톡 스타일.
 *
 * 잠재 독자 수 결정:
 * - DM / 명시적 그룹: ChatMember 등록된 사람 수
 * - 레벨 자동 공개 채팅: 레벨 충족하는 직원 **전체** (들어와 본 적 없는 사람도 포함)
 *   → 안 들어온 직원 = "안 읽은 사람"으로 카운트, 들어와서 markAsRead 하면 1씩 감소
 *
 * 읽은 사람 수 = ChatMember 중 lastReadAt이 메시지 createdAt 이후인 사람 (발신자 제외)
 * unread = max(0, 잠재독자 - 1(발신자) - 읽은사람수)
 *
 * 본인 발송 메시지에만 의미 있음 (받은 메시지는 0으로 클라이언트에서 무시)
 */
export async function computeUnreadCounts(
  chatId: string,
  messages: Array<{ id: string; userId: string | null; createdAt: Date }>,
): Promise<Record<string, number>> {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { levelRequired: true },
  });
  const members = await prisma.chatMember.findMany({
    where: { chatId },
    select: { userId: true, lastReadAt: true },
  });

  // 잠재 독자 수
  let totalEligible: number;
  if (chat?.levelRequired !== null && chat?.levelRequired !== undefined) {
    // 레벨 채팅 — 레벨 충족 활성 직원 전체 (User.level은 입사 시 role.defaultLevel 복사값)
    totalEligible = await prisma.user.count({
      where: { level: { gte: chat.levelRequired }, active: true },
    });
  } else {
    totalEligible = members.length;
  }

  const result: Record<string, number> = {};
  for (const m of messages) {
    if (totalEligible <= 1) {
      result[m.id] = 0;
      continue;
    }
    // userId 있으면 발신자 제외, 없으면(AI/SYSTEM) 모든 사람이 잠재 독자
    const others = m.userId ? totalEligible - 1 : totalEligible;
    let readers = 0;
    for (const mb of members) {
      if (m.userId && mb.userId === m.userId) continue;
      if (!mb.lastReadAt) continue;
      if (mb.lastReadAt.getTime() >= m.createdAt.getTime()) readers += 1;
    }
    result[m.id] = Math.max(0, others - readers);
  }
  return result;
}

// =====================================================
// 채팅방 정보
// =====================================================
export async function getChatInfo(chatId: string, userId: string) {
  const access = await canAccess(chatId, userId);
  if (!access.ok) return null;

  // 레벨 채팅 미가입 시 자동 가입
  if (!access.isMember) {
    await ensureMembership(chatId, userId);
  }

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

  // 본인의 lastReadAt (resume 위치용)
  const me = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: { lastReadAt: true },
  });

  const others = chat.members
    .filter((m) => m.userId !== userId)
    .map((m) => m.user);

  let title: string;
  if (chat.type === "DM") {
    title = others[0]?.name ?? "(상대 없음)";
  } else if (chat.levelRequired !== null) {
    title = chat.name ?? `레벨 ${chat.levelRequired}+ 채팅`;
  } else {
    title = chat.name ?? others.map((u) => u.name).join(", ");
  }

  return {
    ...chat,
    title,
    otherMembers: others,
    myLastReadAt: me?.lastReadAt ?? null,
    isLevelChat: chat.levelRequired !== null,
  };
}

// =====================================================
// 메시지 전송
// =====================================================
export type ReplyToMeta = {
  messageId: string;
  userName: string;
  contentPreview: string;
};

export type AttachmentMeta = {
  kind: "image" | "video" | "file";
  path: string; // 스토리지 경로 (R2 key)
  mime: string;
  size: number; // bytes
  name: string; // 원본 파일명
  /** ISO 만료일. 이 날짜 이후 자동 삭제 대상. */
  expiresAt: string;
};

export type SendMessageOptions = {
  /** 답글 대상 (있으면 metadata.replyTo에 저장) */
  replyTo?: ReplyToMeta;
  /** 클라이언트가 미리 생성한 ID — 임시/실제 메시지 ID 동일하게 만들어 React key 안정화용 */
  clientMessageId?: string;
  /** 첨부 파일 (이미지/동영상/일반 파일) — 한 메시지에 여러 개 첨부 가능 */
  attachments?: AttachmentMeta[];
};

/** 한 메시지에 묶을 수 있는 첨부 최대 개수 */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

/**
 * 메시지 텍스트에서 @이름 멘션을 찾아 userId 배열 반환.
 * 채팅 멤버 + 레벨 채팅이면 자격 있는 모든 사용자 대상.
 */
export async function extractMentionsFromContent(
  chatId: string,
  content: string,
): Promise<string[]> {
  // 채팅 멤버 후보 — DM/그룹은 명시 멤버, 레벨 채팅은 자격 있는 직원
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      members: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  if (!chat) return [];

  const candidates = new Map<string, string>(); // userId → name
  for (const m of chat.members) {
    if (m.user) candidates.set(m.user.id, m.user.name);
  }
  // 레벨 채팅이면 자격 있는 사용자도 멘션 가능 — 메시지에 이름 들어 있으면
  if (chat.levelRequired !== null) {
    const eligible = await prisma.user.findMany({
      where: {
        role: { defaultLevel: { gte: chat.levelRequired } },
        active: true,
      },
      select: { id: true, name: true },
    });
    for (const u of eligible) candidates.set(u.id, u.name);
  }

  const mentioned: string[] = [];
  for (const [uid, name] of candidates) {
    if (!name) continue;
    // 정확한 이름 매칭 (단어 경계). 한글은 \b가 안 먹어서 lookahead로 보조
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`@${escaped}(?=$|[\\s\\p{P}])`, "u");
    if (re.test(content)) mentioned.push(uid);
  }
  return mentioned;
}

export async function sendMessage(
  chatId: string,
  userId: string,
  content: string,
  options: SendMessageOptions = {},
) {
  const access = await canAccess(chatId, userId);
  if (!access.ok) throw new Error("이 채팅에 접근 권한이 없습니다.");

  if (!access.isMember) {
    await ensureMembership(chatId, userId);
  }

  const trimmed = content.trim();
  // 첨부 정규화 — 최대 개수로 제한
  const attachments = (options.attachments ?? []).slice(
    0,
    MAX_ATTACHMENTS_PER_MESSAGE,
  );
  const hasAttachment = attachments.length > 0;
  // 첨부가 있으면 빈 본문도 허용 (캡션 없이 미디어만 보내는 케이스)
  if (!trimmed && !hasAttachment) {
    throw new Error("메시지가 비어있습니다.");
  }
  if (trimmed.length > 4000)
    throw new Error("메시지가 너무 깁니다 (4000자 제한).");

  // 멘션 추출 (본문이 있을 때만)
  const mentions = trimmed
    ? await extractMentionsFromContent(chatId, trimmed)
    : [];

  const meta: {
    mentions?: string[];
    replyTo?: ReplyToMeta;
    attachments?: AttachmentMeta[];
  } = {};
  if (mentions.length > 0) meta.mentions = mentions;
  if (options.replyTo) meta.replyTo = options.replyTo;
  if (hasAttachment) meta.attachments = attachments;
  const hasMeta = Object.keys(meta).length > 0;

  // 첨부 종류에 맞춰 MessageType 결정 — 전부 이미지면 IMAGE, 하나라도 아니면 FILE
  const messageType: "TEXT" | "IMAGE" | "FILE" = hasAttachment
    ? attachments.every((a) => a.kind === "image")
      ? "IMAGE"
      : "FILE"
    : "TEXT";

  // 클라이언트 ID가 유효하면 그것 사용 (UUID v4 형식 검증)
  const isValidUuid =
    typeof options.clientMessageId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      options.clientMessageId,
    );

  return prisma.message.create({
    data: {
      ...(isValidUuid ? { id: options.clientMessageId } : {}),
      chatId,
      userId,
      type: messageType,
      // 본문 비어 있고 첨부만 있는 경우 — 검색·푸시 텍스트용 content 생성
      content:
        trimmed ||
        (attachments.length > 1
          ? attachments.every((a) => a.kind === "image")
            ? `[사진 ${attachments.length}장]`
            : `[첨부 ${attachments.length}개]`
          : (attachments[0]?.name ?? "[첨부]")),
      ...(hasMeta ? { metadata: meta } : {}),
    },
    include: {
      user: { select: { id: true, username: true, name: true } },
    },
  });
}

// =====================================================
// 읽음 표시 갱신 (멤버십 없으면 생성)
// =====================================================
export async function markAsRead(chatId: string, userId: string) {
  await prisma.chatMember.upsert({
    where: { chatId_userId: { chatId, userId } },
    create: { chatId, userId, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  canAccessForPolling,
  createGroupChat,
  createOrGetDM,
  getMe,
  markAsRead,
  sendMessage,
} from "@/lib/chat";
import { prisma } from "@/lib/db";
import { askAI, AI_GUARDRAIL, friendlyAiError } from "@/lib/ai";
import { sendPushToUsers } from "@/lib/push";
import { extractEventFromMessage } from "@/lib/event-extract";
import { extractOrderIntent } from "@/lib/order-intent";

// =====================================================
// 주문/수요조사 — 응답 제출 + 마감
// =====================================================
type OrderResponse = {
  userId: string;
  name: string;
  choice: string;
  at: string;
};

type OrderMeta = {
  title: string;
  placeholder?: string;
  status: "open" | "closed";
  createdByName?: string;
  closedAt?: string;
  responses: OrderResponse[];
};

export async function submitOrderResponseAction(
  messageId: string,
  choice: string,
): Promise<{ ok: boolean; error?: string; metadata?: unknown }> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };
  const trimmed = choice.trim();
  if (!trimmed) return { ok: false, error: "메뉴를 입력해주세요." };
  if (trimmed.length > 100) {
    return { ok: false, error: "100자 이내로 입력해주세요." };
  }

  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg || msg.type !== "ORDER") {
    return { ok: false, error: "주문 메시지가 아닙니다." };
  }
  // 권한: 해당 채팅 접근 자격(멤버 또는 레벨)이 있어야 응답 가능 (IDOR 방지)
  const okAccess = await canAccessForPolling(msg.chatId, me.id);
  if (!okAccess) {
    return { ok: false, error: "이 채팅에 접근 권한이 없습니다." };
  }
  const meta = (msg.metadata ?? {}) as OrderMeta;
  if (meta.status === "closed") {
    return { ok: false, error: "이미 마감된 주문입니다." };
  }

  // 본인 응답이 있으면 덮어쓰기
  const existing = (meta.responses ?? []).filter((r) => r.userId !== me.id);
  existing.push({
    userId: me.id,
    name: me.name,
    choice: trimmed,
    at: new Date().toISOString(),
  });

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: {
      metadata: {
        ...meta,
        responses: existing,
      },
    },
  });

  revalidatePath(`/chat/${msg.chatId}`);
  return { ok: true, metadata: updated.metadata };
}

export async function closeOrderAction(
  messageId: string,
): Promise<{ ok: boolean; error?: string; metadata?: unknown }> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    include: { user: { select: { id: true } } },
  });
  if (!msg || msg.type !== "ORDER") {
    return { ok: false, error: "주문 메시지가 아닙니다." };
  }

  // 권한: 개설자 OR admin
  const meWithRole = await prisma.user.findUnique({
    where: { id: me.id },
    include: { role: { select: { isAdmin: true } } },
  });
  const isAdmin = !!meWithRole?.role.isAdmin;
  if (msg.userId !== me.id && !isAdmin) {
    return { ok: false, error: "개설자 또는 관리자만 마감할 수 있습니다." };
  }

  const meta = (msg.metadata ?? {}) as OrderMeta;
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: {
      metadata: {
        ...meta,
        status: "closed",
        closedAt: new Date().toISOString(),
      },
    },
  });

  revalidatePath(`/chat/${msg.chatId}`);
  return { ok: true, metadata: updated.metadata };
}

// =====================================================
// 메시지 본인 삭제
// =====================================================
export async function deleteMessageAction(
  messageId: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: { userId: true, chatId: true, type: true },
  });
  if (!msg) return { ok: false, error: "메시지를 찾을 수 없습니다." };

  // 본인 메시지만 삭제 가능 (admin은 채팅방 전체 초기화로 처리)
  if (msg.userId !== me.id) {
    return { ok: false, error: "본인이 작성한 메시지만 삭제할 수 있습니다." };
  }
  // AI 메시지는 사용자가 직접 삭제 불가 (혼란 방지)
  if (msg.type === "AI" || msg.type === "EVENT_PROPOSAL") {
    return { ok: false, error: "AI/시스템 메시지는 삭제할 수 없습니다." };
  }

  await prisma.message.delete({ where: { id: messageId } });
  revalidatePath(`/chat/${msg.chatId}`);
  return { ok: true };
}

// =====================================================
// admin: 채팅방 전체 초기화 (모든 메시지 삭제)
// =====================================================
export async function clearChatRoomAction(
  chatId: string,
): Promise<{ ok: boolean; error?: string; deletedCount?: number }> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const meWithRole = await prisma.user.findUnique({
    where: { id: me.id },
    include: { role: true },
  });
  if (!meWithRole?.role.isAdmin) {
    return { ok: false, error: "관리자만 초기화할 수 있습니다." };
  }

  const result = await prisma.message.deleteMany({ where: { chatId } });

  // 시스템 메시지 1개 INSERT → Realtime이 모든 클라이언트에 전파
  // 클라이언트는 metadata.kind === "ROOM_CLEARED" 감지 시 messages 배열을 이 메시지만 남기고 비움
  await prisma.message.create({
    data: {
      chatId,
      userId: null,
      type: "SYSTEM",
      content: "관리자가 채팅방을 초기화했습니다.",
      metadata: { kind: "ROOM_CLEARED" } as object,
    },
  });

  revalidatePath(`/chat/${chatId}`);
  return { ok: true, deletedCount: result.count };
}

// =====================================================
// AI 자동 응답 모드 토글 (관리자 전용)
// 켜진 채팅방에서는 질문형 메시지에 AI가 자동 응답 — 클라이언트가 트리거.
// =====================================================
export async function setChatAiAutoReplyAction(
  chatId: string,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const meWithRole = await prisma.user.findUnique({
    where: { id: me.id },
    include: { role: { select: { isAdmin: true } } },
  });
  if (!meWithRole?.role.isAdmin) {
    return { ok: false, error: "관리자만 자동 응답 모드를 변경할 수 있습니다." };
  }

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { id: true },
  });
  if (!chat) return { ok: false, error: "채팅방을 찾을 수 없습니다." };

  await prisma.chat.update({
    where: { id: chatId },
    data: { aiAutoReply: enabled },
  });

  revalidatePath(`/chat/${chatId}`);
  return { ok: true };
}

// 채팅방 자체 삭제 (관리자 전용)
// 정책:
// - role.isAdmin 만 가능 — 일반 직원은 leaveChatAction으로 본인 멤버만 해제
// - 레벨 기반 자동 공개 채팅도 admin이면 삭제 가능 (nest 자동 재가입 대상이지만 admin이 의도적으로 정리)
// - prisma cascade: ChatMember/Message 모두 자동 삭제됨
// =====================================================
export async function deleteChatAction(
  chatId: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const meWithRole = await prisma.user.findUnique({
    where: { id: me.id },
    include: { role: { select: { isAdmin: true } } },
  });
  if (!meWithRole?.role.isAdmin) {
    return { ok: false, error: "관리자만 채팅방을 삭제할 수 있습니다." };
  }

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { id: true },
  });
  if (!chat) return { ok: false, error: "채팅방을 찾을 수 없습니다." };

  await prisma.chat.delete({ where: { id: chatId } });

  revalidatePath("/chat");
  return { ok: true };
}

// 채팅방 나가기
// 정책:
// - 레벨 기반 자동 공개 채팅(levelRequired != null): 나갈 수 없음 (레벨 충족 시 자동 재가입됨)
// - DM / 명시적 그룹: 멤버에서 자기 자신 제거 → 채팅 목록에서 사라짐
// 그룹의 경우 시스템 메시지로 다른 멤버에게 알림.
// =====================================================
export async function leaveChatAction(
  chatId: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { type: true, levelRequired: true },
  });
  if (!chat) return { ok: false, error: "채팅방을 찾을 수 없습니다." };

  if (chat.levelRequired !== null) {
    return {
      ok: false,
      error: "레벨 기반 자동 공개 채팅방은 나갈 수 없습니다.",
    };
  }

  const membership = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId: me.id } },
  });
  if (!membership) {
    return { ok: false, error: "이 채팅방의 멤버가 아닙니다." };
  }

  // 그룹은 다른 멤버에게 시스템 메시지로 알림 (DM은 의미 없음)
  if (chat.type === "GROUP") {
    await prisma.$transaction([
      prisma.message.create({
        data: {
          chatId,
          userId: null,
          type: "SYSTEM",
          content: `${me.name} 님이 나갔습니다.`,
        },
      }),
      prisma.chatMember.delete({
        where: { chatId_userId: { chatId, userId: me.id } },
      }),
    ]);
  } else {
    await prisma.chatMember.delete({
      where: { chatId_userId: { chatId, userId: me.id } },
    });
  }

  revalidatePath("/chat");
  revalidatePath(`/chat/${chatId}`);
  return { ok: true };
}

// =====================================================
// 직원 선택 → 1:1 채팅 시작
// =====================================================
export async function startDmAction(formData: FormData) {
  const me = await getMe();
  if (!me) redirect("/login");
  const otherUserId = formData.get("userId") as string;
  if (!otherUserId) return;
  const chatId = await createOrGetDM(me.id, otherUserId);
  revalidatePath("/chat");
  redirect(`/chat/${chatId}`);
}

// =====================================================
// 그룹 채팅 생성 (명시 멤버 또는 레벨 기반)
// =====================================================
export type CreateGroupState = {
  error?: string;
};

export async function createGroupChatAction(
  _prev: CreateGroupState,
  formData: FormData,
): Promise<CreateGroupState> {
  const me = await getMe();
  if (!me) return { error: "로그인이 필요합니다." };

  const name = formData.get("name") as string;
  const mode = (formData.get("mode") as string) || "members";

  try {
    let chatId: string;
    if (mode === "level") {
      const levelStr = formData.get("levelRequired") as string;
      const level = parseInt(levelStr, 10);
      if (!Number.isFinite(level)) {
        return { error: "레벨을 숫자로 입력해주세요." };
      }
      chatId = await createGroupChat({
        mode: "level",
        myUserId: me.id,
        name,
        levelRequired: level,
      });
    } else {
      const memberIds = formData.getAll("memberIds") as string[];
      chatId = await createGroupChat({
        mode: "members",
        myUserId: me.id,
        name,
        memberIds,
      });
    }
    revalidatePath("/chat");
    redirect(`/chat/${chatId}`);
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    return {
      error: e instanceof Error ? e.message : "생성 실패",
    };
  }
}

// =====================================================
// 메시지 전송
// =====================================================
export type SendMessageState = {
  error?: string;
};

export async function sendMessageAction(
  _prev: SendMessageState,
  formData: FormData,
): Promise<SendMessageState> {
  const me = await getMe();
  if (!me) return { error: "로그인이 필요합니다." };

  const chatId = formData.get("chatId") as string;
  const content = (formData.get("content") as string) ?? "";

  // 첨부 (이미지/동영상) — 업로드 endpoint 응답을 JSON으로 받아 그대로 전달
  const attachmentRaw = formData.get("attachment") as string | null;
  let attachment:
    | {
        kind: "image" | "video" | "file";
        path: string;
        mime: string;
        size: number;
        name: string;
        expiresAt: string;
      }
    | undefined;
  if (attachmentRaw) {
    try {
      const parsed = JSON.parse(attachmentRaw);
      if (
        parsed &&
        typeof parsed.path === "string" &&
        typeof parsed.kind === "string" &&
        typeof parsed.mime === "string" &&
        typeof parsed.expiresAt === "string"
      ) {
        attachment = {
          kind: parsed.kind,
          path: parsed.path,
          mime: parsed.mime,
          size: typeof parsed.size === "number" ? parsed.size : 0,
          name: typeof parsed.name === "string" ? parsed.name : "attachment",
          expiresAt: parsed.expiresAt,
        };
      }
    } catch {
      // ignore
    }
  }

  // 본문 또는 첨부 둘 중 하나는 있어야 함
  if (!chatId) return {};
  if (!content.trim() && !attachment) return {};

  // 답글 메타 (옵션)
  const replyToRaw = formData.get("replyTo") as string | null;
  let replyTo: { messageId: string; userName: string; contentPreview: string } | undefined;
  if (replyToRaw) {
    try {
      const parsed = JSON.parse(replyToRaw);
      if (parsed?.messageId && parsed?.userName) {
        replyTo = {
          messageId: String(parsed.messageId),
          userName: String(parsed.userName).slice(0, 50),
          contentPreview: String(parsed.contentPreview ?? "").slice(0, 100),
        };
      }
    } catch {
      // ignore
    }
  }

  // 클라이언트가 미리 생성한 메시지 ID (UUID) — React key 안정화용
  const clientMessageId =
    (formData.get("clientMessageId") as string | null)?.trim() || undefined;

  let chatTitle = "FPCTalk";
  try {
    const created = await sendMessage(chatId, me.id, content, {
      replyTo,
      clientMessageId,
      attachment,
    });
    await markAsRead(chatId, me.id);

    const meta = (created.metadata ?? {}) as { mentions?: string[] };
    const mentionedIds = Array.isArray(meta.mentions) ? meta.mentions : [];

    // 채팅 정보 (제목 + 멤버 수신자 목록)
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        name: true,
        type: true,
        levelRequired: true,
        members: {
          select: { userId: true },
        },
      },
    });
    if (chat) {
      chatTitle = chat.name ?? chatTitle;
      const recipients = chat.members
        .map((m) => m.userId)
        .filter((id) => id !== me.id);
      const preview = content.trim().slice(0, 100);

      // 멘션된 사용자에게는 별도 푸시 (제목에 @ 표시)
      const mentionedRecipients = mentionedIds.filter((id) => id !== me.id);
      if (mentionedRecipients.length > 0) {
        void sendPushToUsers(mentionedRecipients, {
          title: `📢 @ ${chat.name ?? me.name}`,
          body: `${me.name}: ${preview}`,
          url: `/chat/${chatId}`,
          tag: `chat-mention-${chatId}`,
        });
      }
      // 일반 푸시 (멘션된 사람 제외 — 중복 알림 방지)
      const others = recipients.filter((id) => !mentionedRecipients.includes(id));
      if (others.length > 0) {
        void sendPushToUsers(others, {
          title: chat.name ?? me.name,
          body: `${me.name}: ${preview}`,
          url: `/chat/${chatId}`,
          tag: `chat-${chatId}`,
        });
      }
    }

    // 관리자 메시지면 AI 일정 추출 시도
    const meWithRole = await prisma.user.findUnique({
      where: { id: me.id },
      include: { role: { select: { isAdmin: true } } },
    });
    if (meWithRole?.role.isAdmin) {
      const extracted = await extractEventFromMessage(content);
      if (extracted.hasEvent) {
        await prisma.message.create({
          data: {
            chatId,
            userId: me.id, // 작성자 = 메시지 보낸 사람 (확인 권한 체크용)
            type: "EVENT_PROPOSAL",
            content: `${extracted.title}`,
            metadata: {
              state: "PENDING",
              title: extracted.title,
              startDate: extracted.startDate,
              endDate: extracted.endDate,
              location: extracted.location ?? null,
            },
          },
        });
      }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "전송 실패" };
  }

  void chatTitle;
  // Realtime이 알아서 새 메시지를 푸시할 거지만, fallback으로 revalidate
  revalidatePath(`/chat/${chatId}`);
  revalidatePath("/chat");
  return {};
}

// =====================================================
// 읽음 표시
// =====================================================
export async function markAsReadAction(chatId: string) {
  const me = await getMe();
  if (!me) return;
  try {
    await markAsRead(chatId, me.id);
  } catch {
    // 멤버 아니면 무시
  }
}

// =====================================================
// 폴링 백업: 특정 시간 이후의 메시지 조회
// Realtime이 끊겨도 5초마다 이걸로 catch-up
// =====================================================

export type PolledMessage = {
  id: string;
  chatId: string;
  userId: string | null;
  content: string;
  type: string;
  createdAt: string;
  user: { id: string; username: string; name: string } | null;
  metadata: unknown;
};

// =====================================================
// 채팅 안 AI 비서 호출 (모든 멤버 사용 가능)
// - @비서 / @AI / @assistant 프리픽스 감지 후 클라이언트가 호출
// - 호출자 본인이 접근 가능한 채팅의 최근 30일 메시지를 컨텍스트로 사용
// - 답변은 type=AI Message로 저장 → Realtime이 모든 멤버에게 전파
// =====================================================

export type ChatAiResult = { error?: string; ok?: boolean };

async function getUserChatContext(
  userId: string,
  currentChatId: string,
): Promise<string> {
  // 본인이 멤버인 채팅
  const memberships = await prisma.chatMember.findMany({
    where: { userId },
    select: { chatId: true },
  });
  const memberChatIds = memberships.map((m) => m.chatId);

  // 레벨로 접근 가능한 채팅
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: { select: { defaultLevel: true } } },
  });
  const myLevel = u?.role.defaultLevel ?? 0;
  const levelChats = await prisma.chat.findMany({
    where: {
      levelRequired: { not: null, lte: myLevel },
      id: { notIn: memberChatIds },
    },
    select: { id: true },
  });
  const allChatIds = [...memberChatIds, ...levelChats.map((c) => c.id)];
  if (allChatIds.length === 0) return "";

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const messages = await prisma.message.findMany({
    where: {
      chatId: { in: allChatIds },
      createdAt: { gte: since },
      type: { not: "AI" }, // AI 메시지는 컨텍스트에서 제외 (echo 방지)
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: {
      user: { select: { name: true, username: true } },
      chat: { select: { id: true, name: true, type: true } },
    },
  });
  if (messages.length === 0) return "";

  messages.reverse(); // 시간 오름차순
  const lines = messages.map((m) => {
    const sender = m.user?.name ?? "(이름없음)";
    const here = m.chat.id === currentChatId;
    const chatLabel = here
      ? "(이 채팅)"
      : m.chat.name ??
        (m.chat.type === "DM" ? "1:1 채팅" : "그룹 채팅");
    const t = m.createdAt
      .toISOString()
      .replace("T", " ")
      .slice(0, 16);
    return `[${t}] [${chatLabel}] ${sender}: ${m.content.slice(0, 500)}`;
  });
  return lines.join("\n");
}

export async function triggerChatAiAction(
  chatId: string,
  prompt: string,
): Promise<ChatAiResult> {
  const me = await getMe();
  if (!me) return { error: "로그인이 필요합니다." };

  // 채팅 접근 권한 (멤버 또는 레벨)
  const okAccess = await canAccessForPolling(chatId, me.id);
  if (!okAccess) return { error: "이 채팅에 접근 권한이 없습니다." };

  const trimmed = prompt.trim();
  if (!trimmed) return { error: "질문을 입력해주세요." };
  if (trimmed.length > 2000) {
    return { error: "질문이 너무 깁니다 (2000자 제한)." };
  }

  // 1) 주문/수요조사 의도면 ORDER 메시지 생성 (일반 AI 답변 대신)
  const orderIntent = await extractOrderIntent(trimmed);
  if (orderIntent.hasOrder) {
    await prisma.message.create({
      data: {
        chatId,
        userId: me.id, // 개설자 = 호출한 사람
        type: "ORDER",
        content: orderIntent.title,
        metadata: {
          title: orderIntent.title,
          placeholder: orderIntent.placeholder,
          status: "open",
          createdByName: me.name,
          responses: [],
        },
      },
    });
    revalidatePath(`/chat/${chatId}`);
    return { ok: true };
  }

  // 2) 일반 AI 답변 — 컨텍스트 수집
  const context = await getUserChatContext(me.id, chatId);
  const contextSize = context ? context.split("\n").length : 0;

  // 오늘 날짜 (KST 기준 — 사용자가 보는 날짜)
  const todayIso = new Date().toISOString().slice(0, 10);

  const systemPrompt = `${AI_GUARDRAIL}

채팅방에 호출되어 모든 멤버가 답변을 봅니다.
오늘 날짜: ${todayIso}

[날짜 필터 — 매우 중요]
- 기본: 사용자가 날짜를 명시하지 않으면 **오늘(${todayIso}) 발화만** 답변에 사용하세요.
  ('오늘 개별 하원?', '지금 누가 휴가?' 같은 질문 → 오늘 메시지만 인용)
- 사용자가 "어제/그제/지난주/N일 전/특정 날짜(5월 10일/MM-DD/YYYY-MM-DD 등)"를 **명시적으로**
  가리키면 그 날 발화도 사용. ('어제 개별 하원?' → 어제 메시지 인용)
- 명시 없으면 다른 날짜 발화는 절대 답변에 포함하지 마세요. 오해 방지.
- 오늘 발화가 없는데 사용자가 오늘만 물었으면 "오늘 등록된 내용이 없습니다"라고 답하세요
  (과거 발화를 끌어오지 말 것).

[답변 포맷 — 가독성 우선]
- 한 발화/한 항목은 한 줄. 여러 인용을 한 문장으로 길게 이어붙이지 마세요.
- 항목이 2개 이상이면 마지막 줄에 "→ ..." 한 줄 요약을 추가.
- 항목 1개면 한 줄 인용 + 결론을 같은 문장 또는 다음 줄에 짧게.
- 답변 전체는 6줄 이내로 유지 (그룹에서 보는 답변이라 짧을수록 좋음).

[채팅 인용 시]
- 누가/언제 말한 정보인지 인용 (예: "박은숙님이 ${todayIso} 09:13에 '...'라고 말씀하셨습니다")
- 시간은 'MM-DD HH:MM' 짧은 형태로 (연도가 다르면 'YYYY-MM-DD HH:MM').

[예시 — '오늘 개별 하원?' 질문 (날짜 명시 없음)]
김파커님이 ${todayIso.slice(5)} 05:52에 "김신 개별하원해요"라고 말씀하셨습니다.
→ 오늘 개별 하원: 김신
(이전 날짜의 개별 하원 발화는 절대 포함하지 않음)

[예시 — '어제 개별 하원?' 질문 (어제 명시)]
어제 발화만 검토 → "박은숙님이 (어제) 09:13에 '길동이 개별하원'이라고 말씀하셨습니다. → 어제 개별 하원: 길동"

[참고: 호출자가 접근 가능한 채팅의 최근 30일 메시지 — 날짜 필터 규칙에 따라 골라 사용]
${context || "(아직 채팅 기록이 없습니다)"}

이제 직원의 질문에 답하세요.`;

  // 자동 모드 — 컨텍스트 크면 Pro로
  const mode = contextSize > 100 ? "pro" : undefined;

  let aiText: string;
  let modelUsed = "unknown";
  let aiMode: "fast" | "pro" = "fast";
  try {
    const result = await askAI(trimmed, {
      mode,
      system: systemPrompt,
      maxTokens: 1500,
      useSearch: true, // 실시간 정보 (날씨/뉴스 등) 답변 가능
    });
    aiText = result.text.trim();
    modelUsed = result.modelUsed;
    aiMode = result.mode;
  } catch (e) {
    aiText = friendlyAiError(e);
  }

  // type=AI Message로 저장 → Realtime이 모든 멤버에게 전파
  await prisma.message.create({
    data: {
      chatId,
      userId: null,
      type: "AI",
      content: aiText,
      metadata: { model: modelUsed, mode: aiMode } as object,
    },
  });

  revalidatePath(`/chat/${chatId}`);
  return { ok: true };
}

/**
 * 번역 응답에서 마크다운 코드 펜스 / 앞뒤 따옴표 제거.
 * Gemini가 가끔 ```...``` 또는 "..."로 감싸서 반환하는 케이스 대응.
 */
function cleanTranslation(raw: string): string {
  let out = raw.trim();
  // ```\n...\n``` 또는 ```lang\n...\n``` 펜스 제거
  out = out.replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?\s*```\s*$/i, "");
  // 앞뒤 매칭되는 큰/작은 따옴표 제거 (양쪽이 같은 따옴표일 때만)
  // /s flag 대신 [\s\S]로 멀티라인 매칭
  const m = out.match(/^["']([\s\S]+)["']$/);
  if (m && m[1]) out = m[1];
  return out.trim();
}

// =====================================================
// 다중 텍스트 일괄 번역 (ORDER 응답들, EVENT_PROPOSAL 필드 등)
// =====================================================
export async function translateTextsAction(
  texts: string[],
  target: "ko" | "en",
): Promise<{ translations?: string[]; error?: string }> {
  const me = await getMe();
  if (!me) return { error: "로그인이 필요합니다." };

  if (!Array.isArray(texts) || texts.length === 0) {
    return { translations: [] };
  }
  if (texts.length > 60) {
    return { error: "한 번에 60개까지만 번역 가능합니다." };
  }

  // 빈 항목은 원문 그대로
  const work = texts.map((t, i) => ({
    idx: i,
    text: typeof t === "string" ? t.trim() : "",
  }));
  const nonEmpty = work.filter((w) => w.text.length > 0);
  if (nonEmpty.length === 0) {
    return { translations: texts.map(() => "") };
  }

  const lines = nonEmpty.map((w) => `L${w.idx}: ${w.text}`).join("\n");
  const targetLabel = target === "ko" ? "Korean" : "English";

  const systemPrompt = `You translate each line to ${targetLabel}.
Output ONLY one line per input, prefixed with the EXACT same "Lnumber:" tag.
- Preserve names, numbers, emoji, special characters.
- If a line is already in ${targetLabel}, output it as-is.
- No explanations, no quotes, no extra lines.`;

  try {
    const r = await askAI(lines, {
      mode: "fast",
      system: systemPrompt,
      maxTokens: 2048,
    });

    const out: string[] = texts.map((t) => (typeof t === "string" ? t : ""));
    const responseLines = r.text.split("\n");
    for (const ln of responseLines) {
      const m = ln.match(/^L(\d+):\s*(.*)$/);
      if (!m) continue;
      const idx = parseInt(m[1], 10);
      if (idx >= 0 && idx < texts.length) {
        const value = cleanTranslation(m[2]);
        if (value.length > 0) out[idx] = value;
      }
    }
    return { translations: out };
  } catch (e) {
    return {
      error: friendlyAiError(e),
    };
  }
}

// =====================================================
// 메시지 번역

export type TranslateResult = {
  error?: string;
  translation?: string;
  /** 감지/타겟 언어 라벨 */
  fromLang?: string;
  toLang?: string;
};

export async function translateMessageAction(
  text: string,
  target: "ko" | "en",
): Promise<TranslateResult> {
  const me = await getMe();
  if (!me) return { error: "로그인이 필요합니다." };

  const trimmed = text.trim();
  if (!trimmed) return { error: "번역할 텍스트가 없습니다." };
  if (trimmed.length > 2000) {
    return { error: "텍스트가 너무 깁니다 (2000자 제한)." };
  }

  const targetLabel = target === "ko" ? "Korean" : "English";
  const fromLabel = target === "ko" ? "English (or other)" : "Korean (or other)";

  const systemPrompt = `You are a precise translator. Translate the user's message to ${targetLabel}.
Rules:
- Output ONLY the translation. No quotes, no explanations, no notes.
- Preserve names, numbers, dates, emoji exactly as-is.
- Keep tone/register similar to the original.
- If the source is already in ${targetLabel}, output it as-is.`;

  try {
    const result = await askAI(trimmed, {
      mode: "fast",
      system: systemPrompt,
      maxTokens: 1024,
    });
    return {
      translation: cleanTranslation(result.text),
      fromLang: fromLabel,
      toLang: targetLabel,
    };
  } catch (e) {
    return {
      error: friendlyAiError(e),
    };
  }
}

/**
 * 채팅방의 ORDER 메시지 metadata 동기화용 (5초 폴링).
 * Realtime UPDATE가 REPLICA IDENTITY 설정 없으면 metadata 못 보내는 경우 백업.
 * 활성 + 최근 마감된 ORDER 5개까지만 반환.
 */
export async function getOrderMessagesAction(
  chatId: string,
): Promise<Array<{ id: string; metadata: unknown; content: string; type: string }>> {
  const me = await getMe();
  if (!me) return [];

  const okAccess = await canAccessForPolling(chatId, me.id);
  if (!okAccess) return [];

  const orders = await prisma.message.findMany({
    where: { chatId, type: "ORDER" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, metadata: true, content: true, type: true },
  });
  return orders;
}

export async function getMessagesSinceAction(
  chatId: string,
  sinceIso: string,
): Promise<PolledMessage[]> {
  const me = await getMe();
  if (!me) return [];

  // 권한 체크 (멤버 또는 레벨 충족)
  const okAccess = await canAccessForPolling(chatId, me.id);
  if (!okAccess) return [];

  const since = new Date(sinceIso);
  if (isNaN(since.getTime())) return [];

  const rows = await prisma.message.findMany({
    where: {
      chatId,
      createdAt: { gt: since },
    },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, username: true, name: true } },
    },
    take: 50,
  });

  return rows.map((m) => ({
    id: m.id,
    chatId: m.chatId,
    userId: m.userId,
    content: m.content,
    type: m.type,
    createdAt: m.createdAt.toISOString(),
    user: m.user,
    metadata: m.metadata,
  }));
}

// =====================================================
// 메시지 검색 — 채팅방 안에서 키워드(content)로 검색
// =====================================================
export type SearchHit = {
  id: string;
  content: string;
  type: string;
  createdAt: string;
  userName: string | null;
};

export async function searchMessagesAction(
  chatId: string,
  keyword: string,
): Promise<{ ok: boolean; results: SearchHit[]; error?: string }> {
  const me = await getMe();
  if (!me) return { ok: false, results: [], error: "로그인이 필요합니다." };

  const q = keyword.trim();
  if (q.length < 1) return { ok: true, results: [] };

  const okAccess = await canAccessForPolling(chatId, me.id);
  if (!okAccess) return { ok: false, results: [], error: "권한이 없습니다." };

  // 본문(content) 부분일치, 대소문자 무시. 첨부/시스템 등도 content에 파일명·문구가 들어가므로 포함.
  const rows = await prisma.message.findMany({
    where: {
      chatId,
      content: { contains: q, mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
    take: 100,
  });

  return {
    ok: true,
    results: rows.map((m) => ({
      id: m.id,
      content: m.content,
      type: m.type,
      createdAt: m.createdAt.toISOString(),
      userName: m.user?.name ?? null,
    })),
  };
}

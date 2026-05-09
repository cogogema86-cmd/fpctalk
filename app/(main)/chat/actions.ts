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
import { askAI } from "@/lib/ai";
import { sendPushToUsers } from "@/lib/push";
import { extractEventFromMessage } from "@/lib/event-extract";

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
  const content = formData.get("content") as string;
  if (!chatId || !content?.trim()) return {};

  let chatTitle = "FPCTalk";
  try {
    await sendMessage(chatId, me.id, content);
    await markAsRead(chatId, me.id);

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
      if (recipients.length > 0) {
        const preview = content.trim().slice(0, 100);
        void sendPushToUsers(recipients, {
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

  // 컨텍스트 수집
  const context = await getUserChatContext(me.id, chatId);
  const contextSize = context ? context.split("\n").length : 0;

  const systemPrompt = `당신은 Francis Parker 학원의 AI 비서입니다. 채팅방에 호출되어 모든 멤버가 답변을 봅니다.

[당신의 역할]
- 학원의 채팅 기록을 알고 있는 비서로서 정확한 정보를 인용해 답변
- 답변은 모든 채팅 멤버에게 보이므로 명확하고 간결하게
- 누가/언제 말한 정보인지 인용 (예: "박은숙님이 2026-04-10 09:13에 '...'라고 말씀하셨습니다")

[답변 원칙]
- 사용자가 한국어로 물으면 한국어로, 영어로 물으면 영어로 답변
- 추측하지 말 것. 채팅 기록에 없으면 "관련 기록을 찾을 수 없습니다"라고 답변
- 답변은 4~5문장 이내 간결하게 (그룹에서 보는 답변)
- 이모지는 의미 전달에 꼭 필요할 때만

[참고: 호출자가 접근 가능한 채팅의 최근 30일 메시지]
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
    });
    aiText = result.text.trim();
    modelUsed = result.modelUsed;
    aiMode = result.mode;
  } catch (e) {
    aiText = `❌ AI 응답 실패: ${e instanceof Error ? e.message : "알 수 없는 에러"}`;
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
      translation: result.text.trim(),
      fromLang: fromLabel,
      toLang: targetLabel,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "번역 실패",
    };
  }
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
  }));
}

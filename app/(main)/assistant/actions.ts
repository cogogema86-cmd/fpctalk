"use server";

import { askAI, classifyMode, AI_GUARDRAIL, friendlyAiError, type AiMode } from "@/lib/ai";
import { getMe } from "@/lib/chat";
import { prisma } from "@/lib/db";
import { getPersonalEventsForAiContext } from "@/lib/personal-events";

export type AssistantMode = "auto" | "fast" | "pro";

export type AssistantResponse =
  | {
      ok: true;
      text: string;
      modelUsed: string;
      mode: AiMode;
      contextSize: number; // 참고: 몇 개의 메시지를 컨텍스트로 사용했는지
    }
  | {
      ok: false;
      error: string;
    };

/**
 * 학원장이 멤버인 모든 채팅의 최근 메시지를 컨텍스트로 가져옴.
 * - 직원이 멤버인 채팅 + 레벨로 접근 가능한 레벨 채팅
 * - 최근 30일 또는 최대 1000개
 */
async function getChatContext(userId: string): Promise<string> {
  // 멤버 채팅 + 레벨 채팅
  const memberships = await prisma.chatMember.findMany({
    where: { userId },
    select: { chatId: true },
  });
  const memberChatIds = memberships.map((m) => m.chatId);

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

  // 최근 30일치 메시지 (또는 최대 1000개)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const messages = await prisma.message.findMany({
    where: {
      chatId: { in: allChatIds },
      createdAt: { gte: since },
      // AI 메시지 자체는 컨텍스트에 안 넣음 (echo 방지)
      type: { not: "AI" },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: {
      user: { select: { name: true, username: true } },
      chat: { select: { name: true, type: true } },
    },
  });

  if (messages.length === 0) return "";

  // 시간 오름차순으로 정렬
  messages.reverse();

  const formatted = messages
    .map((m) => {
      const sender = m.user?.name ?? "(이름없음)";
      const chatLabel =
        m.chat.name ??
        (m.chat.type === "DM" ? "1:1 채팅" : "그룹 채팅");
      const t = m.createdAt
        .toISOString()
        .replace("T", " ")
        .slice(0, 16);
      return `[${t}] [${chatLabel}] ${sender}: ${m.content.slice(0, 500)}`;
    })
    .join("\n");

  return formatted;
}

export async function askAssistantAction(
  prompt: string,
  mode: AssistantMode = "auto",
): Promise<AssistantResponse> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  // 권한 재확인 (레벨 3+)
  const meWithRole = await prisma.user.findUnique({
    where: { id: me.id },
    include: { role: { select: { defaultLevel: true } } },
  });
  if (!meWithRole || meWithRole.role.defaultLevel < 3) {
    return { ok: false, error: "AI 비서는 학원장(레벨 3+)만 사용할 수 있습니다." };
  }

  const trimmed = prompt.trim();
  if (!trimmed) return { ok: false, error: "질문을 입력해주세요." };
  if (trimmed.length > 4000) {
    return { ok: false, error: "질문이 너무 깁니다 (4000자 제한)." };
  }

  // 채팅 컨텍스트 + 본인 개인 일정 컨텍스트 (병렬)
  const [chatContext, personalEventsContext] = await Promise.all([
    getChatContext(me.id),
    getPersonalEventsForAiContext(me.id),
  ]);
  const contextSize = chatContext ? chatContext.split("\n").length : 0;

  // 컨텍스트가 많으면 자동으로 Pro 모드 강제 (긴 컨텍스트 처리)
  let finalMode: AiMode | undefined =
    mode === "auto" ? undefined : mode;
  if (mode === "auto" && contextSize > 100) {
    finalMode = "pro";
  }

  // 오늘 날짜 (한국 기준) — AI가 D-day 계산할 수 있도록
  const todayIso = new Date().toISOString().slice(0, 10);

  const systemPrompt = `${AI_GUARDRAIL}

학원장 ${me.name}님을 보좌하는 비서입니다.
오늘 날짜: ${todayIso}

[채팅 기록 인용 시]
- 학원 채팅 기록에서 가져온 정보는 누가/언제 말했는지 인용
  예: "박은숙님이 2026-04-10 09:13에 '길동이 개별하원'이라고 말씀하셨습니다."
  English: "Park Eun-sook said on 2026-04-10 09:13: 'Gildong individual pickup'"

[학원장 본인의 개인 일정 (PERSONAL_EVENTS) — 절대 비공개]
- 아래는 학원장 ${me.name}님 본인만 설정한 비공개 일정입니다. 본인 답변에만 활용.
- 학원장이 "오늘 일정", "내일 일정", "5월 17일 일정" 등으로 물으면 이 목록을 우선 참고.
- D-day 임박한 일정이 있으면 "5월 17일 학부모 미팅이 D-3 남았습니다. 확인해주세요" 같은 능동적 알림 가능.
${personalEventsContext || "(등록된 개인 일정이 없습니다)"}

[참고: 학원의 최근 30일 채팅 기록]
${chatContext || "(아직 채팅 기록이 없습니다)"}

이제 학원장의 요청에 답하세요.`;

  try {
    const result = await askAI(trimmed, {
      mode: finalMode,
      system: systemPrompt,
      useSearch: true, // 실시간 정보 (날씨/뉴스 등) 답변 가능
    });
    return {
      ok: true,
      text: result.text,
      modelUsed: result.modelUsed,
      mode: result.mode,
      contextSize,
    };
  } catch (e) {
    console.error("[assistant] AI 호출 실패:", e);
    return {
      ok: false,
      error: friendlyAiError(e),
    };
  }
}

export async function previewMode(prompt: string): Promise<AiMode> {
  return classifyMode(prompt);
}

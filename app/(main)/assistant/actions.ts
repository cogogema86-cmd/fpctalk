"use server";

import { askAI, classifyMode, type AiMode } from "@/lib/ai";
import { getMe } from "@/lib/chat";

export type AssistantMode = "auto" | "fast" | "pro";

export type AssistantResponse =
  | {
      ok: true;
      text: string;
      modelUsed: string;
      mode: AiMode;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * AI 비서에게 질문 → 답변
 * - mode "auto": 키워드/길이 기반 자동 분류
 * - mode "fast" / "pro": 강제 지정
 */
export async function askAssistantAction(
  prompt: string,
  mode: AssistantMode = "auto",
): Promise<AssistantResponse> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const trimmed = prompt.trim();
  if (!trimmed) return { ok: false, error: "질문을 입력해주세요." };
  if (trimmed.length > 4000) {
    return { ok: false, error: "질문이 너무 깁니다 (4000자 제한)." };
  }

  const finalMode: AiMode | undefined =
    mode === "auto" ? undefined : mode;

  const systemPrompt = `당신은 Francis Parker 학원 직원의 업무 비서입니다.
사용자: ${me.name} (${me.username})

원칙:
- 한국어로 답변. 간결하고 명확하게.
- 학원 운영(수업, 출결, 학사 일정, 학부모 응대, 직원 관리, 보고서 작성)에 특화.
- 모르는 정보는 추측하지 말고 "확인이 필요합니다"라고 답변.
- 이모지는 의미 전달에 도움이 될 때만 절제해서 사용.
- 코드/숫자/이름 등은 정확히 표기.`;

  try {
    const result = await askAI(trimmed, {
      mode: finalMode,
      system: systemPrompt,
    });
    return {
      ok: true,
      text: result.text,
      modelUsed: result.modelUsed,
      mode: result.mode,
    };
  } catch (e) {
    console.error("[assistant] AI 호출 실패:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "AI 호출 실패",
    };
  }
}

/**
 * 자동 분류 결과만 미리 알려주는 헬퍼 (UI에서 모드 표시용)
 */
export async function previewMode(prompt: string): Promise<AiMode> {
  return classifyMode(prompt);
}

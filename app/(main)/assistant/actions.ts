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

  const finalMode: AiMode | undefined = mode === "auto" ? undefined : mode;

  const systemPrompt = `당신은 Francis Parker 학원 직원의 비서입니다.
사용자: ${me.name} (${me.username})

[당신의 주된 역할]
1. 일반 채팅 도우미 — 학원 운영 관련 질문 응답
2. 잊어버린 정보 다시 알려주기 — 이전 대화에서 사용자가 말한 내용 정리
3. 약속·일정 확인 — 사용자가 제공한 일정 정보 정리
4. 문서 초안 작성 — 공지문, 안내문, 동의서, 양식 등
5. 회의 내용 정리 / 요약

[당신이 직접 접근할 수 없는 것 — 이런 질문 받으면 안내]
- 출퇴근 데이터 → "근태 메뉴에서 직접 확인해주세요"
- 매출/재무 데이터 → "이 시스템에서는 다루지 않습니다"
- 학생/학부모 개별 정보 → "학사 시스템 또는 별도 자료를 참조해주세요"
- 직원 비밀번호/계정 정보 → "관리자 메뉴에서 처리됩니다"

[원칙]
- 한국어로 답변. 간결하고 명확하게.
- 모르는 정보는 추측하지 말고 "확인이 필요합니다"라고 답변.
- 사용자가 제공한 정보(일정·결정사항·이름 등)는 그대로 정리/재구성.
- 학부모용 안내문은 정중하고 친근한 톤, 직원용은 명확하고 간결한 톤.
- 이모지는 의미 전달에 도움이 될 때만 절제해서 사용.`;

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
 * 자동 분류 결과만 미리 알려주는 헬퍼 (UI 표시용)
 */
export async function previewMode(prompt: string): Promise<AiMode> {
  return classifyMode(prompt);
}

/**
 * 채팅 @AI 호출 메시지가 "주문/수요조사 받기" 의도인지 판별.
 * Gemini Flash JSON 모드, prefilter로 비용 절감.
 */

import { askAI } from "@/lib/ai";

export type OrderIntent =
  | { hasOrder: false }
  | { hasOrder: true; title: string; placeholder: string };

const HAS_KEYWORD =
  /(주문|수요\s?조사|메뉴|받아|받습니다|투표|모집|취합|모아|점심|회식|간식|order|menu|survey|poll|collect|gather|lunch)/i;

function buildPrompt(message: string): string {
  return [
    `User message: """${message}"""`,
    "",
    "Decide if the user is asking the AI assistant to OPEN a survey/order/poll where each member submits ONE input (e.g. coffee menu, lunch choice, attendance for an event).",
    'Return ONLY a JSON object on a single line, no markdown.',
    "",
    "If yes:",
    `{"hasOrder":true,"title":"<short title in source language, e.g. '커피 주문' or 'Coffee order', max 30 chars>","placeholder":"<short hint for response field, e.g. '예) 아이스 아메리카노' or 'e.g. Iced Americano', max 30 chars>"}`,
    "",
    "If no (general question, conversation, factual query):",
    `{"hasOrder":false}`,
    "",
    "Examples that are YES:",
    "- '@AI 커피 주문 받아주세요' → {hasOrder:true,title:'커피 주문',placeholder:'예) 아이스 아메리카노'}",
    "- '@AI 점심 뭐 먹을지 수요조사 해줘' → {hasOrder:true,title:'점심 메뉴',placeholder:'예) 김치찌개'}",
    "- 'collect coffee orders please' → {hasOrder:true,title:'Coffee order',placeholder:'e.g. Latte'}",
    "",
    "Examples that are NO:",
    "- '오늘 일정 알려줘' → {hasOrder:false}",
    "- 'what time is it' → {hasOrder:false}",
    "- 'tell me a joke' → {hasOrder:false}",
  ].join("\n");
}

export async function extractOrderIntent(message: string): Promise<OrderIntent> {
  const trimmed = message.trim();
  if (trimmed.length < 4) return { hasOrder: false };
  if (!HAS_KEYWORD.test(trimmed)) return { hasOrder: false };

  try {
    const r = await askAI(buildPrompt(trimmed), {
      mode: "fast",
      system:
        "You are an intent classifier for a school chat. Output ONLY raw JSON, never markdown.",
      maxTokens: 200,
    });
    let raw = r.text.trim();
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    }
    const parsed = JSON.parse(raw);
    if (parsed?.hasOrder !== true) return { hasOrder: false };
    if (!parsed.title) return { hasOrder: false };
    return {
      hasOrder: true,
      title: String(parsed.title).slice(0, 60),
      placeholder: String(parsed.placeholder ?? "").slice(0, 60),
    };
  } catch {
    return { hasOrder: false };
  }
}

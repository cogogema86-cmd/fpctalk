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

/**
 * 명시적 패턴이면 AI 호출 없이 즉시 ORDER 모드.
 * "X 주문 받아", "X 수요조사", "X 메뉴 받아", "X 투표" 등.
 */
const EXPLICIT_PATTERNS: Array<{
  re: RegExp;
  suffix: string;
  placeholderHint: string;
}> = [
  // 한국어
  { re: /(.+?)\s*주문\s*(받|취합|모|부탁)/, suffix: "주문", placeholderHint: "메뉴" },
  { re: /(.+?)\s*수요\s*조사/, suffix: "수요조사", placeholderHint: "응답" },
  { re: /(.+?)\s*메뉴\s*(받|모|취합)/, suffix: "메뉴", placeholderHint: "메뉴" },
  { re: /(.+?)\s*투표\s*(받|해|모)/, suffix: "투표", placeholderHint: "선택" },
  { re: /(.+?)\s*참석\s*(여부|조사|체크)/, suffix: "참석 조사", placeholderHint: "참석/불참" },
  { re: /(.+?)\s*신청\s*(받|모|취합)/, suffix: "신청 받기", placeholderHint: "응답" },
  // English
  { re: /(.+?)\s+(order|menu|survey|poll)\s*(s|please|collect|gather|open)/i, suffix: "", placeholderHint: "response" },
];

function detectExplicitOrder(text: string): OrderIntent | null {
  // @AI / @비서 / @ 트리거 부분 제거
  const stripped = text
    .replace(/^@(?:비서|ai|assistant)?\s+/i, "")
    .trim();

  for (const cat of EXPLICIT_PATTERNS) {
    const m = stripped.match(cat.re);
    if (!m) continue;

    let subject = (m[1] ?? "").trim();
    // 의미 없는 prefix 제거
    subject = subject
      .replace(/^(부탁|좀|please|일단|이번에|오늘)\s*/i, "")
      .trim()
      .slice(0, 30);

    const cleanSubject = subject || "";
    const isEnglish = /^[A-Za-z\s]+$/.test(cleanSubject);

    let title: string;
    if (cat.suffix) {
      title = cleanSubject
        ? `${cleanSubject} ${cat.suffix}`
        : cat.suffix;
    } else {
      // English path — 두 번째 그룹이 종류 (order/menu/survey/poll)
      const kind = (m[2] ?? "").toLowerCase();
      title = cleanSubject ? `${cleanSubject} ${kind}` : kind;
    }
    title = title.slice(0, 60);

    const placeholder = isEnglish
      ? `e.g. ${cat.placeholderHint}`
      : cleanSubject
        ? `예) ${cleanSubject} ${cat.placeholderHint}`
        : `예) ${cat.placeholderHint}`;

    return {
      hasOrder: true,
      title,
      placeholder: placeholder.slice(0, 60),
    };
  }
  return null;
}

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

  // 1) 명시적 키워드 — AI 호출 없이 즉시 매칭 (가장 안전·빠름)
  const explicit = detectExplicitOrder(trimmed);
  if (explicit) return explicit;

  // 2) prefilter — 키워드 전혀 없으면 의도 X
  if (!HAS_KEYWORD.test(trimmed)) return { hasOrder: false };

  // 3) 모호한 케이스만 AI에 위임
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

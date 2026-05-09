/**
 * 채팅 메시지에서 학원 행사 일정을 추출.
 *
 * 사용처: 관리자 메시지가 sendMessage로 들어오면 이 함수를 호출.
 * 일정 정보가 있으면 { hasEvent: true, ...details } 반환.
 *
 * 비용 절약을 위해:
 *  - 메시지 길이 8자 미만 → 즉시 false
 *  - 날짜 패턴(숫자/요일/월) 없음 → 즉시 false (cheap regex prefilter)
 *  - 위 통과 시에만 AI 호출 (Gemini Flash, JSON 모드)
 */

import { askAI } from "@/lib/ai";

export type ExtractedEvent =
  | { hasEvent: false }
  | {
      hasEvent: true;
      title: string;
      startDate: string; // ISO
      endDate: string; // ISO (단일 날짜면 startDate와 같은 날 23:59)
      location?: string;
    };

const HAS_DATE_HINT = /(\d{1,2})[./월\-]|오늘|내일|모레|이번\s?주|다음\s?주|월요일|화요일|수요일|목요일|금요일|토요일|일요일|today|tomorrow|next\s?week/i;
const HAS_EVENT_HINT = /(일정|행사|이벤트|모임|회의|체험학습|소풍|축제|MT|워크샵|학회|발표회|학부모|일잡|예정|계획|등록|schedule|event|meeting|trip|outing)/i;

function buildPrompt(now: Date, message: string): string {
  const todayIso = now.toISOString();
  return [
    `Today is ${todayIso} (UTC).`,
    `User message (Korean or English): """${message}"""`,
    "",
    "Decide if this message announces a SPECIFIC ACADEMY EVENT (a concrete date or date range).",
    'Return ONLY a JSON object on a SINGLE LINE, no markdown fences, no explanation.',
    "",
    "If yes:",
    `{"hasEvent":true,"title":"<short title in source language, max 30 chars>","startDate":"<ISO 8601 with timezone>","endDate":"<ISO 8601>","location":"<optional>"}`,
    "",
    "If no:",
    `{"hasEvent":false}`,
    "",
    "Rules:",
    "- 'startDate' / 'endDate' must be ISO 8601 in Asia/Seoul timezone (use +09:00 offset).",
    "- For a single-day event, set startDate=YYYY-MM-DDT09:00:00+09:00, endDate=YYYY-MM-DDT18:00:00+09:00.",
    "- For a range, set startDate to the first day's 00:00 and endDate to the last day's 23:59 (KST).",
    "- 'today/tomorrow/next week' should be resolved against TODAY above.",
    "- Generic chatter, opinions, complaints, status updates, or messages without a CONCRETE date → hasEvent:false.",
    "- 'meeting at 3pm' (no date) → false unless 'today/tomorrow' is present.",
    "- Only return real events scheduled in the FUTURE or within last 24h. Past events older than 24h → false.",
  ].join("\n");
}

export async function extractEventFromMessage(
  message: string,
): Promise<ExtractedEvent> {
  const trimmed = message.trim();
  if (trimmed.length < 8) return { hasEvent: false };
  if (!HAS_DATE_HINT.test(trimmed)) return { hasEvent: false };
  if (!HAS_EVENT_HINT.test(trimmed)) return { hasEvent: false };

  try {
    const prompt = buildPrompt(new Date(), trimmed);
    const r = await askAI(prompt, {
      mode: "fast",
      system: "You are an event-detection classifier. Output ONLY raw JSON, never markdown.",
      maxTokens: 200,
    });
    let raw = r.text.trim();
    // Markdown 펜스 제거 (혹시)
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { hasEvent: false };
    if (parsed.hasEvent !== true) return { hasEvent: false };
    if (!parsed.title || !parsed.startDate || !parsed.endDate) {
      return { hasEvent: false };
    }
    // 날짜 sanity
    const s = new Date(parsed.startDate);
    const e = new Date(parsed.endDate);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      return { hasEvent: false };
    }
    // 너무 먼 미래 (1년 이상) — 잘못 추출됐을 가능성
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    if (s.getTime() > Date.now() + oneYear) return { hasEvent: false };
    // 과거 24h 이전
    if (e.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      return { hasEvent: false };
    }
    return {
      hasEvent: true,
      title: String(parsed.title).slice(0, 60),
      startDate: s.toISOString(),
      endDate: e.toISOString(),
      location: parsed.location ? String(parsed.location).slice(0, 60) : undefined,
    };
  } catch {
    return { hasEvent: false };
  }
}

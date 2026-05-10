/**
 * AI 추상화 레이어 (FPCTalk)
 *
 * 이 파일이 외부와 AI 사이의 유일한 접점입니다.
 * - 모델/프로바이더 변경 시 이 파일만 수정
 * - 일상 대화는 fast 모델, 업무 작업은 pro 모델로 자동/명시 라우팅
 *
 * 환경변수:
 *   AI_PROVIDER       (기본: gemini)
 *   AI_MODEL_FAST     (예: gemini-2.5-flash)
 *   AI_MODEL_PRO      (예: gemini-2.5-pro)
 *   GEMINI_API_KEY
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

export type AiMode = "fast" | "pro";

export type AiCallOptions = {
  /** "fast"=일상, "pro"=사무. 미지정시 prompt 분석으로 자동 판단 */
  mode?: AiMode;
  /** 시스템 지침 */
  system?: string;
  /** 출력 길이 제한 */
  maxTokens?: number;
  /** Google Search grounding 활성화 (실시간 정보 답변 시) */
  useSearch?: boolean;
};

/**
 * 모든 사용자 노출 AI 응답에 공통 적용할 안전 가이드.
 * 호출자의 system prompt 앞에 prepend됨.
 */
export const AI_GUARDRAIL = [
  "당신은 Francis Parker Collegiate 학원의 AI 비서입니다.",
  "응답 규칙을 반드시 지키세요:",
  "1. 모르는 정보는 추측하지 말고 \"정확한 정보가 없습니다\" 또는 \"확인 후 알려드리겠습니다\"라고 답하세요.",
  "2. 사실(factual) 질문에 자신 없으면 절대로 만들어내지 마세요. 할루시네이션 금지.",
  "3. 학원 채팅·일정·인물 등은 제공된 컨텍스트에 있는 정보만 인용하세요. 없으면 모른다고 답.",
  "4. 외부 실시간 정보(날씨, 뉴스, 환율, 시세, 일반 상식)는 검색 도구가 활성화돼 있으면 그 결과를 인용해 답하고, 활성화되지 않았으면 \"실시간 정보는 확인할 수 없습니다\"라고 답하세요.",
  "5. 응답은 한국어 또는 English 중 사용자 질문 언어로 답하세요.",
  "6. 답변에 자신감 표현(반드시, 절대) 대신 출처가 있는 사실만 단정하세요.",
].join("\n");

export type AiResponse = {
  text: string;
  modelUsed: string;
  mode: AiMode;
};

/**
 * AI 호출 에러를 사용자 친화적 메시지로 변환.
 * - 429 / quota 초과: 한도 안내
 * - 401 / 403: 인증 안내
 * - 그 외: 일반 메시지 + 짧게 요약
 */
export function friendlyAiError(error: unknown, locale: "ko" | "en" = "ko"): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const lower = raw.toLowerCase();

  const isQuota =
    lower.includes("429") ||
    lower.includes("too many requests") ||
    lower.includes("quota") ||
    lower.includes("rate limit");
  const isAuth =
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("api key") ||
    lower.includes("permission denied");

  if (isQuota) {
    return locale === "en"
      ? "⏱ AI usage limit reached for today. Please ask the admin to upgrade billing."
      : "⏱ AI 호출 한도(무료 일일 20회)에 도달했습니다. 관리자에게 Gemini 결제 활성화를 요청하세요.";
  }
  if (isAuth) {
    return locale === "en"
      ? "🔑 AI API key issue. Please ask the admin to check the configuration."
      : "🔑 AI API 키 문제입니다. 관리자에게 설정 확인을 요청하세요.";
  }
  // 일반 에러는 80자로 자르고 안내 문구
  const head = raw.replace(/\s+/g, " ").trim().slice(0, 80);
  return locale === "en"
    ? `❌ AI response failed${head ? ` (${head})` : ""}`
    : `❌ AI 응답 실패${head ? ` (${head})` : ""}`;
}

// =====================================================
// 자동 라우팅: prompt를 보고 fast/pro 결정
// 학원 비서의 주 업무에 맞춘 키워드 (문서 작성·정리 위주)
// =====================================================
const PRO_KEYWORDS = [
  // 문서 초안 작성류
  "공지문", "안내문", "동의서", "안내장",
  "초안", "양식", "매뉴얼", "지침", "규정",
  // 정리·요약류
  "회의록", "정리해줘", "요약해줘", "정리해 줘", "요약해 줘",
  // 일정·약속 정리
  "일정 정리", "약속 정리", "스케줄 정리",
];

export function classifyMode(prompt: string): AiMode {
  // 키워드 매칭
  if (PRO_KEYWORDS.some((kw) => prompt.includes(kw))) return "pro";
  // 길이 + 복잡도
  if (prompt.length > 250) return "pro";
  // 명시 슬래시
  if (/^\s*\/pro\b/i.test(prompt)) return "pro";
  return "fast";
}

// =====================================================
// 단일 진입점
// =====================================================
export async function askAI(
  prompt: string,
  options: AiCallOptions = {},
): Promise<AiResponse> {
  const provider = process.env.AI_PROVIDER ?? "gemini";
  const mode: AiMode = options.mode ?? classifyMode(prompt);

  if (provider === "gemini") {
    return callGemini(prompt, mode, options);
  }

  throw new Error(`Unknown AI provider: ${provider}`);
}

// =====================================================
// Gemini 어댑터
// =====================================================
async function callGemini(
  prompt: string,
  mode: AiMode,
  options: AiCallOptions,
): Promise<AiResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const modelName =
    mode === "pro"
      ? (process.env.AI_MODEL_PRO ?? "gemini-3.1-flash-lite")
      : (process.env.AI_MODEL_FAST ?? "gemini-3.1-flash-lite");

  const genAI = new GoogleGenerativeAI(apiKey);

  // Google Search grounding (gemini 2.x): 실시간/외부 사실 정보 답변 시
  // 라이브러리 타입에 정식 노출되지 않은 필드라 unknown으로 캐스팅
  const tools = options.useSearch
    ? ([{ googleSearch: {} } as unknown] as never)
    : undefined;

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: options.system,
    generationConfig: options.maxTokens
      ? { maxOutputTokens: options.maxTokens }
      : undefined,
    tools,
  });

  try {
    const result = await model.generateContent(prompt);
    return {
      text: result.response.text(),
      modelUsed: modelName,
      mode,
    };
  } catch (e) {
    // grounding 미지원 모델 → search 없이 재시도
    if (options.useSearch) {
      const fallback = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: options.system,
        generationConfig: options.maxTokens
          ? { maxOutputTokens: options.maxTokens }
          : undefined,
      });
      const result = await fallback.generateContent(prompt);
      return {
        text: result.response.text(),
        modelUsed: modelName,
        mode,
      };
    }
    throw e;
  }
}

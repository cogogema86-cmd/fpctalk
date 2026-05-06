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
};

export type AiResponse = {
  text: string;
  modelUsed: string;
  mode: AiMode;
};

// =====================================================
// 자동 라우팅: prompt를 보고 fast/pro 결정
// =====================================================
const PRO_KEYWORDS = [
  "보고서", "분석", "검토", "결재", "기안",
  "회의록", "공지사항", "공지", "통계", "데이터",
  "계약", "근로", "복리후생", "업무", "프로젝트 계획",
  "예산", "비용 분석", "감사", "법적", "정책",
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
      ? (process.env.AI_MODEL_PRO ?? "gemini-2.5-pro")
      : (process.env.AI_MODEL_FAST ?? "gemini-2.5-flash");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: options.system,
    generationConfig: options.maxTokens
      ? { maxOutputTokens: options.maxTokens }
      : undefined,
  });

  const result = await model.generateContent(prompt);
  return {
    text: result.response.text(),
    modelUsed: modelName,
    mode,
  };
}

/**
 * 앱 설정 (관리자가 런타임에 바꾸는 값) — DB 기반.
 * AI 모델명을 여기서 읽으면 재배포 없이 즉시 반영된다.
 * DB 값이 없으면 환경변수 → 코드 기본값으로 폴백.
 */
import { prisma } from "@/lib/db";

const KEY_FAST = "ai.modelFast";
const KEY_PRO = "ai.modelPro";

// 코드 기본값 (DB·env 모두 비었을 때)
export const DEFAULT_AI_MODEL = "gemini-3.1-flash-lite";

export type AiModels = { fast: string; pro: string };

/** 현재 적용 중인 AI 모델 (DB → env → 기본값). AI 호출 시마다 읽어 실시간 반영. */
export async function getAiModels(): Promise<AiModels> {
  let rows: { key: string; value: string }[] = [];
  try {
    rows = await prisma.appSetting.findMany({
      where: { key: { in: [KEY_FAST, KEY_PRO] } },
      select: { key: true, value: true },
    });
  } catch {
    // DB 조회 실패 시 env/기본값으로 폴백
  }
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const pick = (k: string, env?: string) =>
    (map.get(k)?.trim() || env?.trim() || DEFAULT_AI_MODEL);
  return {
    fast: pick(KEY_FAST, process.env.AI_MODEL_FAST),
    pro: pick(KEY_PRO, process.env.AI_MODEL_PRO),
  };
}

/** 관리자가 모델명을 저장 (즉시 반영). */
export async function setAiModels(fast: string, pro: string): Promise<void> {
  const f = fast.trim();
  const p = pro.trim();
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: KEY_FAST },
      create: { key: KEY_FAST, value: f },
      update: { value: f },
    }),
    prisma.appSetting.upsert({
      where: { key: KEY_PRO },
      create: { key: KEY_PRO, value: p },
      update: { value: p },
    }),
  ]);
}

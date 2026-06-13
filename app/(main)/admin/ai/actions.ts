"use server";

import { revalidatePath } from "next/cache";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";
import {
  setAiModels,
  getGeminiApiKey,
  setGeminiApiKey,
  clearGeminiApiKey,
} from "@/lib/app-settings";

async function requireAdmin(): Promise<
  { ok: true; meId: string } | { ok: false; error: string }
> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };
  const u = await prisma.user.findUnique({
    where: { id: me.id },
    include: { role: { select: { isAdmin: true } } },
  });
  if (!u?.role.isAdmin) return { ok: false, error: "관리자 권한이 필요합니다." };
  return { ok: true, meId: me.id };
}

/**
 * 구글에서 현재 사용 가능한 제미나이 모델 목록을 실시간 조회.
 * generateContent를 지원하는 모델만 추려 반환 (최신순 비슷하게 정렬).
 */
export async function listGeminiModelsAction(): Promise<{
  ok: boolean;
  models?: { id: string; label: string }[];
  error?: string;
}> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const apiKey = await getGeminiApiKey();
  if (!apiKey) return { ok: false, error: "API 키가 설정되지 않았습니다." };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=1000`,
      { signal: AbortSignal.timeout(15_000), cache: "no-store" },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `목록 조회 실패 (${res.status}) ${t.slice(0, 120)}` };
    }
    const data = (await res.json()) as {
      models?: {
        name?: string;
        displayName?: string;
        supportedGenerationMethods?: string[];
      }[];
    };
    const list = (data.models ?? [])
      .filter((m) =>
        (m.supportedGenerationMethods ?? []).includes("generateContent"),
      )
      .map((m) => {
        const id = (m.name ?? "").replace(/^models\//, "");
        return { id, label: m.displayName ? `${id} — ${m.displayName}` : id };
      })
      .filter((m) => m.id.startsWith("gemini"))
      // 버전 높은(최신) 모델이 위로 오도록 대략 정렬
      .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));

    return { ok: true, models: list };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 160) : "목록 조회 실패",
    };
  }
}

/** AI 모델명 저장 — 다음 AI 호출부터 즉시 반영 (재배포 불필요). */
export async function setAiModelsAction(
  fast: string,
  pro: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const f = (fast ?? "").trim();
  const p = (pro ?? "").trim();
  if (!f || !p) return { ok: false, error: "모델명을 모두 입력해주세요." };
  if (f.length > 100 || p.length > 100) {
    return { ok: false, error: "모델명이 너무 깁니다." };
  }

  await setAiModels(f, p);
  revalidatePath("/admin/ai");
  return { ok: true };
}

/** 입력한 모델명으로 실제 호출해 작동 여부 확인 (저장 전 검증용). */
export async function testAiModelAction(
  model: string,
): Promise<{ ok: boolean; sample?: string; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const name = (model ?? "").trim();
  if (!name) return { ok: false, error: "모델명을 입력해주세요." };

  const apiKey = await getGeminiApiKey();
  if (!apiKey) return { ok: false, error: "API 키가 설정되지 않았습니다." };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const m = genAI.getGenerativeModel({ model: name });
    const r = await m.generateContent("한 단어로만 답해: 안녕하세요?");
    const text = r.response.text().trim().slice(0, 40);
    return { ok: true, sample: text || "(빈 응답)" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "호출 실패";
    return { ok: false, error: msg.slice(0, 200) };
  }
}

/** Gemini API 키 저장 — 다음 AI 호출부터 즉시 반영 (재배포 불필요). */
export async function setGeminiApiKeyAction(
  key: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const k = (key ?? "").trim();
  if (!k) return { ok: false, error: "API 키를 입력해주세요." };
  if (k.length < 10 || k.length > 200) {
    return { ok: false, error: "API 키 형식이 올바르지 않습니다." };
  }

  await setGeminiApiKey(k);
  revalidatePath("/admin/ai");
  return { ok: true };
}

/** 저장된 API 키 삭제 → 환경변수로 복귀. */
export async function clearGeminiApiKeyAction(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  await clearGeminiApiKey();
  revalidatePath("/admin/ai");
  return { ok: true };
}

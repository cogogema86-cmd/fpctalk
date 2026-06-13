"use server";

import { revalidatePath } from "next/cache";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";
import { setAiModels } from "@/lib/app-settings";

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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY가 설정되지 않았습니다." };

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

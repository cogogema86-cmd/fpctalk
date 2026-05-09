"use server";

import { revalidatePath } from "next/cache";
import { getMe } from "@/lib/chat";
import {
  deleteTemplate,
  requestSignaturesFromTemplate,
  saveTemplate,
} from "@/lib/documents";
import { prisma } from "@/lib/db";

async function requireLevelThree(): Promise<{ ok: true; meId: string } | { ok: false; error: string }> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };
  const u = await prisma.user.findUnique({
    where: { id: me.id },
    include: { role: { select: { defaultLevel: true } } },
  });
  if (!u || u.role.defaultLevel < 3) {
    return { ok: false, error: "학원장(레벨 3+)만 사용할 수 있습니다." };
  }
  return { ok: true, meId: me.id };
}

export type SaveTemplateState = { error?: string; ok?: boolean };

export async function saveTemplateAction(
  _prev: SaveTemplateState,
  formData: FormData,
): Promise<SaveTemplateState> {
  const guard = await requireLevelThree();
  if (!guard.ok) return { error: guard.error };

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const koFile = formData.get("koFile") as File | null;
  const enFile = formData.get("enFile") as File | null;

  if (!name) return { error: "양식 이름을 입력해주세요." };
  if (!koFile || koFile.size === 0) {
    return { error: "한국어 파일을 첨부해주세요." };
  }

  try {
    await saveTemplate({
      uploaderId: guard.meId,
      name,
      description: description || undefined,
      koFile,
      enFile: enFile && enFile.size > 0 ? enFile : null,
    });
    revalidatePath("/assistant");
    return { ok: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "양식 저장 실패",
    };
  }
}

export async function deleteTemplateAction(
  templateId: string,
): Promise<{ error?: string }> {
  const guard = await requireLevelThree();
  if (!guard.ok) return { error: guard.error };
  try {
    await deleteTemplate(guard.meId, templateId);
    revalidatePath("/assistant");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "삭제 실패" };
  }
}

export type RequestSignaturesResult = {
  error?: string;
  documentId?: string;
  signersCount?: number;
};

export async function requestSignaturesAction(
  templateId: string,
): Promise<RequestSignaturesResult> {
  const guard = await requireLevelThree();
  if (!guard.ok) return { error: guard.error };
  try {
    const r = await requestSignaturesFromTemplate(guard.meId, templateId);
    revalidatePath("/documents");
    revalidatePath("/assistant");
    return { documentId: r.documentId, signersCount: r.signersCount };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "사인 요청 실패",
    };
  }
}

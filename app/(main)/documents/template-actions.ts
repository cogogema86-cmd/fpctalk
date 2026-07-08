"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getMe } from "@/lib/chat";
import { prisma } from "@/lib/db";
import {
  createExternalSignatureRequests,
  createSignatureRequests,
  deleteTemplate,
  saveTemplate,
  updateTemplate,
  type ExternalSignerInput,
} from "@/lib/documents";
import { sendPushToUsers } from "@/lib/push";
import { sendSms } from "@/lib/sms";

async function requireAdmin(): Promise<
  { ok: true; meId: string } | { ok: false; error: string }
> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };
  const u = await prisma.user.findUnique({
    where: { id: me.id },
    include: { role: { select: { isAdmin: true } } },
  });
  if (!u?.role.isAdmin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  return { ok: true, meId: me.id };
}

// =====================================================
// 양식 저장 (관리자)
// =====================================================
export type SaveTemplateState = { error?: string; ok?: boolean };

export async function saveTemplateAction(
  _prev: SaveTemplateState,
  formData: FormData,
): Promise<SaveTemplateState> {
  const guard = await requireAdmin();
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
    revalidatePath("/documents");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "양식 저장 실패" };
  }
}

// =====================================================
// 양식 수정 — 이름/설명 변경, 파일은 새로 첨부한 경우에만 교체
// =====================================================
export async function updateTemplateAction(
  _prev: SaveTemplateState,
  formData: FormData,
): Promise<SaveTemplateState> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  const templateId = (formData.get("templateId") as string) ?? "";
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const koFile = formData.get("koFile") as File | null;
  const enFile = formData.get("enFile") as File | null;

  if (!templateId) return { error: "양식 ID가 없습니다." };
  if (!name) return { error: "양식 이름을 입력해주세요." };

  try {
    await updateTemplate({
      uploaderId: guard.meId,
      templateId,
      name,
      description: description || undefined,
      koFile: koFile && koFile.size > 0 ? koFile : null,
      enFile: enFile && enFile.size > 0 ? enFile : null,
    });
    revalidatePath("/documents");
    revalidatePath(`/documents/templates/${templateId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "양식 수정 실패" };
  }
}

// =====================================================
// 양식 삭제
// =====================================================
export async function deleteTemplateAction(
  templateId: string,
): Promise<{ error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  try {
    await deleteTemplate(guard.meId, templateId);
    revalidatePath("/documents");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "삭제 실패" };
  }
}

// =====================================================
// 양식으로 사인 요청 보내기 (선택한 직원/외부 사인자)
// =====================================================
export type RequestSignaturesState = {
  error?: string;
  campaignId?: string;
  signersCount?: number;
};

export async function requestSignaturesFromTemplateAction(
  _prev: RequestSignaturesState,
  formData: FormData,
): Promise<RequestSignaturesState> {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  const templateId = formData.get("templateId") as string;
  const signerIdsRaw = formData.getAll("signerIds") as string[];
  const externalsJson = formData.get("externals") as string | null;

  if (!templateId) return { error: "양식 ID가 없습니다." };

  // 외부 사인자 파싱
  let externals: ExternalSignerInput[] = [];
  if (externalsJson) {
    try {
      const parsed = JSON.parse(externalsJson);
      if (Array.isArray(parsed)) {
        externals = parsed
          .filter((p) => p && typeof p.name === "string" && p.name.trim())
          .map((p) => ({
            name: p.name.trim(),
            email: typeof p.email === "string" ? p.email.trim() : undefined,
            phone: typeof p.phone === "string" ? p.phone.trim() : undefined,
          }));
      }
    } catch {
      // 무시
    }
  }

  if (signerIdsRaw.length === 0 && externals.length === 0) {
    return { error: "직원 또는 외부 사인자 1명 이상 추가해주세요." };
  }

  // 양식 확인
  const tpl = await prisma.documentTemplate.findUnique({
    where: { id: templateId },
  });
  if (!tpl) return { error: "양식을 찾을 수 없습니다." };
  if (tpl.uploaderId !== guard.meId) {
    return { error: "본인이 만든 양식만 사용할 수 있습니다." };
  }

  // PDF 페이지 수 (가능하면)
  const { PDFDocument } = await import("pdf-lib");
  const { downloadFile } = await import("@/lib/storage");
  const storageType = (tpl.storageType ?? "supabase") as
    | "supabase"
    | "drive"
    | "r2";

  let pageCount: number | null = null;
  if (tpl.koMime === "application/pdf") {
    try {
      const buf = await downloadFile(storageType, tpl.koPath);
      pageCount = (await PDFDocument.load(buf)).getPageCount();
    } catch {}
  }

  // 새 캠페인 (Document) 생성
  const doc = await prisma.document.create({
    data: {
      uploaderId: guard.meId,
      title: tpl.name,
      description: tpl.description,
      storagePath: tpl.koPath,
      mimeType: tpl.koMime,
      pageCount,
      storagePathEn: tpl.enPath,
      mimeTypeEn: tpl.enMime,
      templateId: tpl.id,
      storageType,
    },
  });

  // 직원 사인 요청
  if (signerIdsRaw.length > 0) {
    await createSignatureRequests(doc.id, guard.meId, signerIdsRaw);
    // 푸시 알림 (직원만 — 외부 사인자는 토큰 링크라 별도)
    void sendPushToUsers(signerIdsRaw, {
      title: "✍️ 새 사인 요청",
      body: tpl.name,
      url: "/documents",
      tag: `sign-${doc.id}`,
    });
  }

  // 외부 사인 요청
  if (externals.length > 0) {
    const created = await createExternalSignatureRequests(
      doc.id,
      guard.meId,
      externals,
      30,
    );
    // 전화번호가 입력된 외부 사인자에게 사인 링크 문자 자동 발송.
    // 실패해도 요청 자체는 유지 (링크는 문서 상세에서 복사 가능) — 결과만 로그.
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
      "https://www.fpctalk.com";
    await Promise.allSettled(
      created
        .filter((r) => r.phone)
        .map(async (r) => {
          const result = await sendSms(
            r.phone!,
            `[FPCTalk] ${r.name}님, '${tpl.name}' 서명 요청이 도착했습니다.\n아래 링크에서 내용 확인 후 서명해 주세요. (30일간 유효)\nA signature request has arrived. Please review and sign at the link below. (Valid for 30 days)\n${baseUrl}/sign/${r.token}`,
          );
          if (!result.ok) {
            console.error(`[sign SMS] ${r.name}(${r.phone}) 발송 실패:`, result.error);
          }
        }),
    );
  }

  revalidatePath("/documents");
  revalidatePath(`/documents/${doc.id}`);
  revalidatePath(`/documents/templates/${tpl.id}`);
  return {
    campaignId: doc.id,
    signersCount: signerIdsRaw.length + externals.length,
  };
}

// =====================================================
// 외부 사인자 즐겨찾기 (학원 공용 주소록)
// =====================================================
export type ExternalContactView = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

/** 즐겨찾기 등록 — 같은 이름+연락처면 기존 항목 반환 (중복 없음) */
export async function addExternalContactAction(input: {
  name: string;
  email?: string;
  phone?: string;
}): Promise<
  { ok: true; contact: ExternalContactView } | { ok: false; error: string }
> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "이름을 입력해주세요." };
  const email = input.email?.trim() ?? "";
  const phone = input.phone?.trim() ?? "";
  const contact = await prisma.externalContact.upsert({
    where: { name_email_phone: { name, email, phone } },
    create: { name, email, phone },
    update: {},
  });
  return {
    ok: true,
    contact: {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
    },
  };
}

/** 즐겨찾기 삭제 */
export async function deleteExternalContactAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  await prisma.externalContact.delete({ where: { id } }).catch(() => {});
  return { ok: true };
}

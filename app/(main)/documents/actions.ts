"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getMe } from "@/lib/chat";
import {
  createSignatureRequests,
  getDocumentSignedUrl,
  submitSignature,
  uploadDocument,
} from "@/lib/documents";

// =====================================================
// 관리자: 문서 업로드 + 사인 요청
// =====================================================
export type UploadState = {
  error?: string;
  documentId?: string;
};

export async function uploadDocumentAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const me = await getMe();
  if (!me) return { error: "로그인이 필요합니다." };

  const file = formData.get("file") as File;
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const signerIdsRaw = formData.getAll("signerIds") as string[];

  if (!file || file.size === 0) return { error: "PDF 파일을 선택해주세요." };
  if (!title) return { error: "제목을 입력해주세요." };
  if (signerIdsRaw.length === 0) {
    return { error: "사인할 직원을 1명 이상 선택해주세요." };
  }

  try {
    const { id } = await uploadDocument(me.id, file, title, description);
    await createSignatureRequests(id, me.id, signerIdsRaw);
    revalidatePath("/documents");
    return { documentId: id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "업로드 실패" };
  }
}

// =====================================================
// 직원: 사인 제출
// =====================================================
export type SignSubmitState = {
  error?: string;
  ok?: boolean;
};

export async function submitSignatureAction(
  _prev: SignSubmitState,
  formData: FormData,
): Promise<SignSubmitState> {
  const me = await getMe();
  if (!me) return { error: "로그인이 필요합니다." };

  const requestId = formData.get("requestId") as string;
  const signatureBase64 = formData.get("signature") as string;
  if (!requestId || !signatureBase64) {
    return { error: "필수 정보가 누락되었습니다." };
  }
  if (!signatureBase64.startsWith("data:image/png;base64,")) {
    return { error: "사인 형식이 잘못되었습니다." };
  }

  // IP / Agent 수집
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0].trim() ??
    h.get("x-real-ip") ??
    undefined;
  const userAgent = h.get("user-agent") ?? undefined;

  try {
    await submitSignature({
      requestId,
      signerId: me.id,
      signatureBase64,
      ip,
      userAgent,
    });
    revalidatePath("/documents");
    revalidatePath(`/documents/${requestId}`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "사인 처리 실패" };
  }

  return { ok: true };
}

// =====================================================
// 다운로드용 signed URL 발급
// =====================================================
export async function getDownloadUrlAction(
  storagePath: string,
): Promise<{ url?: string; error?: string }> {
  const me = await getMe();
  if (!me) return { error: "로그인이 필요합니다." };

  try {
    const url = await getDocumentSignedUrl(storagePath, 300);
    return { url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "URL 발급 실패" };
  }
}

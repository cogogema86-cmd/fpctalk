"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getMe } from "@/lib/chat";
import {
  createExternalSignatureRequests,
  createSignatureRequests,
  submitSignature,
  uploadDocument,
  type ExternalSignerInput,
} from "@/lib/documents";

// =====================================================
// 관리자: 문서 업로드 + 사인 요청 (직원 + 외부)
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

  // 외부 사인자 (학부모) — JSON으로 전송
  const externalsJson = formData.get("externals") as string | null;
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
      // JSON 파싱 실패 → 외부 사인자 없음으로 처리
    }
  }

  if (!file || file.size === 0) return { error: "파일을 선택해주세요." };
  if (!title) return { error: "제목을 입력해주세요." };
  if (signerIdsRaw.length === 0 && externals.length === 0) {
    return { error: "사인 대상자를 직원 또는 외부 1명 이상 추가해주세요." };
  }

  try {
    const { id } = await uploadDocument(me.id, file, title, description);
    if (signerIdsRaw.length > 0) {
      await createSignatureRequests(id, me.id, signerIdsRaw);
    }
    if (externals.length > 0) {
      await createExternalSignatureRequests(id, me.id, externals, 30);
    }
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

// 다운로드는 이제 /api/files/[id] 라우트로 직접 접근 (서버 액션 불필요)

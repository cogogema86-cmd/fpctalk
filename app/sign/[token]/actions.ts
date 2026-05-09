"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSignatureRequestByToken, submitSignature } from "@/lib/documents";

export type ExtSignSubmitState = {
  error?: string;
  ok?: boolean;
};

export async function submitExternalSignatureAction(
  _prev: ExtSignSubmitState,
  formData: FormData,
): Promise<ExtSignSubmitState> {
  const token = formData.get("token") as string;
  const signatureBase64 = formData.get("signature") as string;
  if (!token || !signatureBase64) {
    return { error: "필수 정보가 누락되었습니다." };
  }
  if (!signatureBase64.startsWith("data:image/png;base64,")) {
    return { error: "사인 형식이 잘못되었습니다." };
  }

  // 토큰으로 요청 조회
  const req = await getSignatureRequestByToken(token);
  if (!req) return { error: "유효하지 않은 사인 링크입니다." };
  if (req.status !== "PENDING") {
    return { error: "이미 처리된 요청입니다." };
  }
  if (req.tokenExpiresAt && req.tokenExpiresAt < new Date()) {
    return { error: "사인 링크가 만료되었습니다." };
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
      requestId: req.id,
      signerId: null,
      externalToken: token,
      signatureBase64,
      ip,
      userAgent,
    });
    revalidatePath(`/documents/${req.documentId}`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "사인 처리 실패" };
  }

  return { ok: true };
}

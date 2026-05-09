"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getMe } from "@/lib/chat";
import { submitSignature } from "@/lib/documents";

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

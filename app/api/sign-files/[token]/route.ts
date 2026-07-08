/**
 * 외부 사인용 파일 다운로드 (no-login, token 기반)
 * GET /api/sign-files/[token]?lang=ko|en
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  downloadFile,
  getDirectSignedUrl,
  type StorageType,
} from "@/lib/storage";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang") === "en" ? "en" : "ko";

  const sigReq = await prisma.signatureRequest.findFirst({
    where: { accessToken: token },
    include: { document: true },
  });
  if (!sigReq) return new NextResponse("Not Found", { status: 404 });

  if (sigReq.tokenExpiresAt && sigReq.tokenExpiresAt < new Date()) {
    return new NextResponse("Token expired", { status: 410 });
  }
  if (sigReq.status === "SIGNED") {
    return new NextResponse("Already signed", { status: 410 });
  }

  const storageType = (sigReq.document.storageType ?? "supabase") as StorageType;
  let path: string;
  let mime: string;
  if (lang === "en") {
    if (!sigReq.document.storagePathEn || !sigReq.document.mimeTypeEn) {
      return new NextResponse("Not Found", { status: 404 });
    }
    path = sigReq.document.storagePathEn;
    mime = sigReq.document.mimeTypeEn;
  } else {
    path = sigReq.document.storagePath;
    mime = sigReq.document.mimeType;
  }

  // stream=1 — 리다이렉트 없이 서버가 직접 스트리밍.
  // 스토리지(R2 등) 직행 URL은 CORS 헤더가 없어서 pdf.js 같은
  // same-origin fetch 소비자는 리다이렉트를 따라가지 못함.
  const wantStream = url.searchParams.get("stream") === "1";

  const signedUrl = wantStream
    ? null
    : await getDirectSignedUrl(storageType, path, 600).catch(() => null);
  if (signedUrl) {
    return NextResponse.redirect(signedUrl);
  }

  try {
    const buf = await downloadFile(storageType, path);
    const blob = new Blob([new Uint8Array(buf)], { type: mime });
    return new NextResponse(blob, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    return new NextResponse(
      `다운로드 실패: ${e instanceof Error ? e.message : ""}`,
      { status: 500 },
    );
  }
}

/**
 * 파일 다운로드 프록시
 * GET /api/files/[documentId]?type=primary|en|signed|template
 *
 * 권한 체크 후:
 *  - storageType="supabase" / "r2": signed URL로 302 redirect
 *  - storageType="drive": Drive에서 받아서 스트리밍
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";
import {
  downloadFile,
  getDirectSignedUrl,
  type StorageType,
} from "@/lib/storage";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getMe();
  if (!me) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "primary";
  const lang = url.searchParams.get("lang");

  // ----- TEMPLATE -----
  if (type === "template") {
    const tpl = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!tpl) return new NextResponse("Not Found", { status: 404 });
    if (tpl.uploaderId !== me.id) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    const isEn = lang === "en";
    const path = isEn ? tpl.enPath : tpl.koPath;
    const mime = isEn ? tpl.enMime : tpl.koMime;
    if (!path || !mime) return new NextResponse("Not Found", { status: 404 });
    const storageType = (tpl.storageType ?? "supabase") as StorageType;
    return serveFile(storageType, path, mime);
  }

  // ----- DOCUMENT -----
  const doc = await prisma.document.findUnique({
    where: { id },
    include: {
      signatureRequests: {
        where: { signerId: me.id },
        select: { id: true, signedPdfPath: true },
      },
    },
  });
  if (!doc) return new NextResponse("Not Found", { status: 404 });

  const isUploader = doc.uploaderId === me.id;
  const isSigner = doc.signatureRequests.length > 0;
  if (!isUploader && !isSigner) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const storageType = (doc.storageType ?? "supabase") as StorageType;

  if (type === "primary") {
    return serveFile(storageType, doc.storagePath, doc.mimeType);
  }
  if (type === "en") {
    if (!doc.storagePathEn || !doc.mimeTypeEn) {
      return new NextResponse("Not Found", { status: 404 });
    }
    return serveFile(storageType, doc.storagePathEn, doc.mimeTypeEn);
  }
  if (type === "signed") {
    // 사인본은 PDF 원본 합성 또는 증명 PDF — 항상 application/pdf
    const SIGNED_MIME = "application/pdf";
    const myReq = doc.signatureRequests[0];
    if (!myReq?.signedPdfPath) {
      if (isUploader) {
        const sigReqId = url.searchParams.get("signRequestId");
        if (!sigReqId) return new NextResponse("signRequestId 필요", { status: 400 });
        const sr = await prisma.signatureRequest.findUnique({
          where: { id: sigReqId },
          select: { documentId: true, signedPdfPath: true },
        });
        if (!sr || sr.documentId !== doc.id || !sr.signedPdfPath) {
          return new NextResponse("Not Found", { status: 404 });
        }
        return serveFile(storageType, sr.signedPdfPath, SIGNED_MIME);
      }
      return new NextResponse("Not Found", { status: 404 });
    }
    return serveFile(storageType, myReq.signedPdfPath, SIGNED_MIME);
  }

  return new NextResponse("Bad Request", { status: 400 });
}

async function serveFile(
  storageType: StorageType,
  storagePath: string,
  mimeType: string,
): Promise<NextResponse> {
  // Supabase / R2: signed URL로 302 redirect (대역폭 절약)
  const signedUrl = await getDirectSignedUrl(storageType, storagePath, 300).catch(() => null);
  if (signedUrl) {
    return NextResponse.redirect(signedUrl);
  }

  // Drive: 파일을 받아서 스트리밍
  try {
    const buf = await downloadFile(storageType, storagePath);
    const blob = new Blob([new Uint8Array(buf)], { type: mimeType });
    return new NextResponse(blob, {
      headers: {
        "Content-Type": mimeType,
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

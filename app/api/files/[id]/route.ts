/**
 * 파일 다운로드 프록시
 * GET /api/files/[documentId]?type=primary|en|signed|template
 *
 * 권한 체크 후:
 *  - storageType="supabase": 5분 signed URL로 302 redirect
 *  - storageType="drive": Drive에서 받아서 스트리밍
 *
 * type:
 *  - primary  : Document.storagePath (한국어/기본 파일)
 *  - en       : Document.storagePathEn (영어 파일)
 *  - signed   : SignatureRequest.signedPdfPath (사인 완료 PDF)
 *  - template : DocumentTemplate 파일 — id는 templateId, lang=ko|en 추가 쿼리
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";
import { downloadFile, getSupabaseSignedUrl, type StorageType } from "@/lib/storage";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getMe();
  if (!me) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "primary";
  const lang = url.searchParams.get("lang"); // template일 때

  // ----- TEMPLATE 분기 -----
  if (type === "template") {
    const tpl = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!tpl) return new NextResponse("Not Found", { status: 404 });
    if (tpl.uploaderId !== me.id) {
      // 본인이 만든 양식만 (관리자도 본인 양식만)
      return new NextResponse("Forbidden", { status: 403 });
    }
    const isEn = lang === "en";
    const path = isEn ? tpl.enPath : tpl.koPath;
    const mime = isEn ? tpl.enMime : tpl.koMime;
    if (!path || !mime) return new NextResponse("Not Found", { status: 404 });
    const storageType = (tpl.storageType ?? "supabase") as StorageType;
    return serveFile(storageType, path, mime);
  }

  // ----- DOCUMENT 분기 -----
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

  // 권한: 업로더이거나 사인 대상자
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
    // 본인의 사인된 PDF (사인 대상자만)
    const myReq = doc.signatureRequests[0];
    if (!myReq?.signedPdfPath) {
      // 관리자가 다른 직원의 사인본을 보고 싶으면 reqId로 별도 호출 필요
      if (isUploader) {
        // 관리자: signRequestId 쿼리로 지정 가능
        const sigReqId = url.searchParams.get("signRequestId");
        if (!sigReqId) return new NextResponse("signRequestId 필요", { status: 400 });
        const sr = await prisma.signatureRequest.findUnique({
          where: { id: sigReqId },
          select: { documentId: true, signedPdfPath: true },
        });
        if (!sr || sr.documentId !== doc.id || !sr.signedPdfPath) {
          return new NextResponse("Not Found", { status: 404 });
        }
        return serveFile(storageType, sr.signedPdfPath, doc.mimeType);
      }
      return new NextResponse("Not Found", { status: 404 });
    }
    return serveFile(storageType, myReq.signedPdfPath, doc.mimeType);
  }

  return new NextResponse("Bad Request", { status: 400 });
}

async function serveFile(
  storageType: StorageType,
  storagePath: string,
  mimeType: string,
): Promise<NextResponse> {
  if (storageType === "supabase") {
    // Supabase는 5분 signed URL로 redirect (대역폭 절약)
    try {
      const signed = await getSupabaseSignedUrl(storagePath, 300);
      return NextResponse.redirect(signed);
    } catch (e) {
      return new NextResponse(
        `URL 발급 실패: ${e instanceof Error ? e.message : ""}`,
        { status: 500 },
      );
    }
  }

  // Drive: 파일을 받아서 스트리밍
  try {
    const buf = await downloadFile(storageType, storagePath);
    // Buffer → Blob (NextResponse BodyInit 호환)
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

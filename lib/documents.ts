/**
 * 문서 + 디지털 사인 헬퍼 (서버 전용)
 *
 * 흐름:
 *  1. uploadDocument: 관리자가 PDF 업로드 → Document row + Storage 저장
 *  2. createSignatureRequests: 대상자들에게 SignatureRequest 일괄 생성
 *  3. submitSignature: 대상자가 사인 → 사인 PNG 저장 + 합성 PDF 생성
 *  4. getSignedPdfUrl: 관리자/대상자가 합성된 PDF 다운로드 (signed URL)
 */
import { prisma } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const DOC_BUCKET = "documents";
const SIG_BUCKET = "signatures";

// =====================================================
// 권한 체크
// =====================================================
async function isUserAdmin(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  return !!u?.role.isAdmin;
}

// =====================================================
// 1. 문서 업로드 (관리자)
// =====================================================
export async function uploadDocument(
  uploaderId: string,
  file: File,
  title: string,
  description?: string,
): Promise<{ id: string; storagePath: string }> {
  if (!(await isUserAdmin(uploaderId))) {
    throw new Error("관리자만 문서를 업로드할 수 있습니다.");
  }
  if (file.type !== "application/pdf") {
    throw new Error("PDF 파일만 업로드할 수 있습니다.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("파일 크기는 10MB 이하여야 합니다.");
  }

  // PDF 페이지 수 추출
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const pageCount = pdfDoc.getPageCount();

  // Storage 업로드
  const ts = Date.now();
  const safe = title.replace(/[^a-zA-Z0-9가-힣_-]/g, "_").slice(0, 30);
  const storagePath = `${uploaderId}/${ts}_${safe}.pdf`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(DOC_BUCKET)
    .upload(storagePath, file, { contentType: "application/pdf" });
  if (uploadError) {
    throw new Error(`업로드 실패: ${uploadError.message}`);
  }

  // DB row
  const doc = await prisma.document.create({
    data: {
      uploaderId,
      title,
      description: description?.trim() || null,
      storagePath,
      mimeType: "application/pdf",
      pageCount,
    },
  });

  return { id: doc.id, storagePath };
}

// =====================================================
// 2. 사인 요청 일괄 생성
// =====================================================
export async function createSignatureRequests(
  documentId: string,
  requesterId: string,
  signerIds: string[],
): Promise<number> {
  if (!(await isUserAdmin(requesterId))) {
    throw new Error("관리자만 사인을 요청할 수 있습니다.");
  }
  if (signerIds.length === 0) return 0;

  // 중복 제거
  const uniqueSignerIds = [...new Set(signerIds)];

  await prisma.signatureRequest.createMany({
    data: uniqueSignerIds.map((signerId) => ({
      documentId,
      requesterId,
      signerId,
      status: "PENDING" as const,
    })),
    skipDuplicates: true,
  });

  return uniqueSignerIds.length;
}

// =====================================================
// 3. 사인 제출
// =====================================================
export type SubmitSignatureParams = {
  requestId: string;
  signerId: string;
  signatureBase64: string; // dataURL: data:image/png;base64,...
  ip?: string;
  userAgent?: string;
};

export async function submitSignature(params: SubmitSignatureParams) {
  const { requestId, signerId, signatureBase64, ip, userAgent } = params;

  // 권한 + 상태 체크
  const req = await prisma.signatureRequest.findUnique({
    where: { id: requestId },
    include: { document: true },
  });
  if (!req) throw new Error("요청을 찾을 수 없습니다.");
  if (req.signerId !== signerId) {
    throw new Error("본인의 사인 요청이 아닙니다.");
  }
  if (req.status !== "PENDING") {
    throw new Error("이미 처리된 요청입니다.");
  }

  // 사인 이미지 base64 → Buffer
  const matches = signatureBase64.match(/^data:image\/png;base64,(.+)$/);
  if (!matches) throw new Error("사인 이미지 형식이 잘못되었습니다.");
  const sigBuffer = Buffer.from(matches[1], "base64");
  if (sigBuffer.length > 512 * 1024) {
    throw new Error("사인 이미지가 너무 큽니다.");
  }

  const admin = createAdminClient();

  // 1) 사인 PNG Storage 저장
  const sigPath = `${signerId}/${requestId}.png`;
  const { error: sigErr } = await admin.storage
    .from(SIG_BUCKET)
    .upload(sigPath, sigBuffer, {
      contentType: "image/png",
      upsert: true,
    });
  if (sigErr) throw new Error(`사인 저장 실패: ${sigErr.message}`);

  // 2) 원본 PDF 다운로드
  const { data: docFile, error: docErr } = await admin.storage
    .from(DOC_BUCKET)
    .download(req.document.storagePath);
  if (docErr || !docFile) {
    throw new Error(`원본 PDF 다운로드 실패: ${docErr?.message}`);
  }
  const docBuffer = Buffer.from(await docFile.arrayBuffer());

  // 3) PDF에 사인 + 메타 페이지 합성
  const pdfDoc = await PDFDocument.load(docBuffer);
  const sigImage = await pdfDoc.embedPng(sigBuffer);

  // 마지막 페이지에 사인 영역 추가 (또는 새 페이지)
  // 단순 구현: 새 페이지 추가 (가독성 + 손상 없음)
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const newPage = pdfDoc.addPage();
  const { width, height } = newPage.getSize();

  // 헤더
  newPage.drawText("Signature", {
    x: 50,
    y: height - 80,
    size: 20,
    font: helveticaFont,
    color: rgb(0, 0, 0),
  });

  // 사인 이미지 (가로 max 300, 비율 유지)
  const sigDims = sigImage.scale(1);
  const maxW = 300;
  const scale = sigDims.width > maxW ? maxW / sigDims.width : 1;
  const sigW = sigDims.width * scale;
  const sigH = sigDims.height * scale;
  newPage.drawImage(sigImage, {
    x: 50,
    y: height - 100 - sigH,
    width: sigW,
    height: sigH,
  });

  // 메타 정보 (영문으로 표기 - StandardFonts는 한글 미지원)
  const signer = await prisma.user.findUnique({
    where: { id: signerId },
    select: { username: true, name: true },
  });
  const now = new Date();
  const meta = [
    `Signer: ${signer?.username ?? signerId}`,
    `Date: ${now.toISOString()}`,
    ip ? `IP: ${ip}` : null,
    userAgent ? `Agent: ${userAgent.slice(0, 60)}` : null,
  ].filter(Boolean);

  let metaY = height - 100 - sigH - 30;
  for (const line of meta) {
    newPage.drawText(line as string, {
      x: 50,
      y: metaY,
      size: 9,
      font: helveticaFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    metaY -= 14;
  }

  // 4) 합성된 PDF 저장
  const signedBytes = await pdfDoc.save();
  const signedBuffer = Buffer.from(signedBytes);
  const signedPath = req.document.storagePath.replace(
    /\.pdf$/i,
    `__signed_${signerId}.pdf`,
  );

  const { error: signedErr } = await admin.storage
    .from(DOC_BUCKET)
    .upload(signedPath, signedBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (signedErr) throw new Error(`합성 PDF 저장 실패: ${signedErr.message}`);

  // 5) DB 업데이트
  await prisma.signatureRequest.update({
    where: { id: requestId },
    data: {
      status: "SIGNED",
      signaturePath: sigPath,
      signedPdfPath: signedPath,
      signedAt: now,
      signerIp: ip ?? null,
      signerAgent: userAgent ?? null,
    },
  });

  return { signedPath };
}

// =====================================================
// 4. Signed URL 생성 (다운로드용)
// =====================================================
export async function getDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds = 300,
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(DOC_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data) throw new Error(`URL 발급 실패: ${error?.message}`);
  return data.signedUrl;
}

// =====================================================
// 조회 함수
// =====================================================
export async function getMyPendingSignatures(signerId: string) {
  return prisma.signatureRequest.findMany({
    where: { signerId, status: "PENDING" },
    include: {
      document: { select: { id: true, title: true, description: true, pageCount: true } },
      requester: { select: { name: true, username: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getMyCompletedSignatures(signerId: string) {
  return prisma.signatureRequest.findMany({
    where: { signerId, status: "SIGNED" },
    include: {
      document: { select: { id: true, title: true } },
    },
    orderBy: { signedAt: "desc" },
    take: 30,
  });
}

export async function getDocumentsByUploader(uploaderId: string) {
  return prisma.document.findMany({
    where: { uploaderId },
    include: {
      _count: { select: { signatureRequests: true } },
      signatureRequests: {
        select: { status: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getDocumentDetailForAdmin(
  documentId: string,
  adminId: string,
) {
  if (!(await isUserAdmin(adminId))) {
    throw new Error("관리자 권한 필요");
  }
  return prisma.document.findUnique({
    where: { id: documentId },
    include: {
      signatureRequests: {
        include: {
          signer: { select: { id: true, name: true, username: true, role: { select: { label: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function getSignatureRequestForSigner(
  requestId: string,
  signerId: string,
) {
  return prisma.signatureRequest.findFirst({
    where: { id: requestId, signerId },
    include: {
      document: true,
      requester: { select: { name: true, username: true } },
    },
  });
}

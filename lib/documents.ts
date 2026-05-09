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
// 1. 문서 업로드 (관리자) — 다중 포맷 지원
// PDF는 페이지 수 자동 추출, 그 외는 원본 그대로
// =====================================================
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function safeFileName(s: string): string {
  return s.replace(/[^a-zA-Z0-9가-힣_-]/g, "_").slice(0, 30);
}

function extFromName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export async function uploadDocument(
  uploaderId: string,
  file: File,
  title: string,
  description?: string,
): Promise<{ id: string; storagePath: string }> {
  if (!(await isUserAdmin(uploaderId))) {
    throw new Error("관리자만 문서를 업로드할 수 있습니다.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("파일 크기는 20MB 이하여야 합니다.");
  }
  if (file.size === 0) {
    throw new Error("파일이 비어있습니다.");
  }

  const isPdf = file.type === "application/pdf";

  let pageCount: number | null = null;
  if (isPdf) {
    const arrayBuffer = await file.arrayBuffer();
    try {
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      pageCount = pdfDoc.getPageCount();
    } catch {
      // PDF 파싱 실패 — 그래도 업로드는 진행
    }
  }

  const ts = Date.now();
  const ext = extFromName(file.name) || (isPdf ? "pdf" : "bin");
  const storagePath = `${uploaderId}/${ts}_${safeFileName(title)}.${ext}`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(DOC_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
    });
  if (uploadError) {
    throw new Error(`업로드 실패: ${uploadError.message}`);
  }

  const doc = await prisma.document.create({
    data: {
      uploaderId,
      title,
      description: description?.trim() || null,
      storagePath,
      mimeType: file.type || "application/octet-stream",
      pageCount,
    },
  });

  return { id: doc.id, storagePath };
}

// =====================================================
// 1-B. 양식 템플릿 업로드 (한국어 + 영어 옵션)
// =====================================================
export type SaveTemplateInput = {
  uploaderId: string;
  name: string;
  description?: string;
  koFile: File;
  enFile?: File | null;
};

async function uploadOneFile(
  uploaderId: string,
  file: File,
  prefix: string,
): Promise<{ path: string; mime: string; fileName: string }> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`${prefix} 파일이 20MB를 초과합니다.`);
  }
  if (file.size === 0) {
    throw new Error(`${prefix} 파일이 비어있습니다.`);
  }
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const ext = extFromName(file.name) || "bin";
  const safeBase = safeFileName(file.name.slice(0, file.name.lastIndexOf(".") || file.name.length));
  const path = `templates/${uploaderId}/${ts}_${prefix}_${safeBase}.${ext}`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(DOC_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (error) throw new Error(`${prefix} 업로드 실패: ${error.message}`);
  return {
    path,
    mime: file.type || "application/octet-stream",
    fileName: file.name,
  };
}

export async function saveTemplate(input: SaveTemplateInput) {
  if (!(await isUserAdmin(input.uploaderId))) {
    throw new Error("관리자만 양식을 저장할 수 있습니다.");
  }
  if (!input.name?.trim()) throw new Error("양식 이름을 입력해주세요.");

  const ko = await uploadOneFile(input.uploaderId, input.koFile, "ko");
  const en = input.enFile
    ? await uploadOneFile(input.uploaderId, input.enFile, "en")
    : null;

  const tpl = await prisma.documentTemplate.create({
    data: {
      uploaderId: input.uploaderId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      koPath: ko.path,
      koMime: ko.mime,
      koFileName: ko.fileName,
      enPath: en?.path,
      enMime: en?.mime,
      enFileName: en?.fileName,
    },
  });
  return tpl;
}

export async function listTemplates(uploaderId: string) {
  if (!(await isUserAdmin(uploaderId))) {
    throw new Error("관리자만 양식 목록을 볼 수 있습니다.");
  }
  return prisma.documentTemplate.findMany({
    where: { uploaderId },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteTemplate(uploaderId: string, templateId: string) {
  if (!(await isUserAdmin(uploaderId))) {
    throw new Error("관리자만 양식을 삭제할 수 있습니다.");
  }
  const tpl = await prisma.documentTemplate.findUnique({
    where: { id: templateId },
  });
  if (!tpl || tpl.uploaderId !== uploaderId) {
    throw new Error("양식을 찾을 수 없습니다.");
  }
  // Storage 파일 삭제 (실패해도 DB는 진행)
  const admin = createAdminClient();
  const paths = [tpl.koPath, tpl.enPath].filter(Boolean) as string[];
  if (paths.length > 0) {
    await admin.storage.from(DOC_BUCKET).remove(paths).catch(() => {});
  }
  await prisma.documentTemplate.delete({ where: { id: templateId } });
}

// =====================================================
// 1-C. 양식으로 전 직원 사인 요청
// 양식 파일을 Document로 복사 + 본인 제외 모든 직원에게 SignatureRequest 생성
// =====================================================
export async function requestSignaturesFromTemplate(
  uploaderId: string,
  templateId: string,
): Promise<{ documentId: string; signersCount: number }> {
  if (!(await isUserAdmin(uploaderId))) {
    throw new Error("관리자만 사인 요청을 보낼 수 있습니다.");
  }
  const tpl = await prisma.documentTemplate.findUnique({
    where: { id: templateId },
  });
  if (!tpl || tpl.uploaderId !== uploaderId) {
    throw new Error("양식을 찾을 수 없습니다.");
  }

  // PDF면 페이지 수 추출 시도
  let pageCount: number | null = null;
  if (tpl.koMime === "application/pdf") {
    const admin = createAdminClient();
    const { data: file } = await admin.storage
      .from(DOC_BUCKET)
      .download(tpl.koPath);
    if (file) {
      try {
        const buf = Buffer.from(await file.arrayBuffer());
        pageCount = (await PDFDocument.load(buf)).getPageCount();
      } catch {}
    }
  }

  // Document 생성 (양식 파일을 그대로 참조)
  const doc = await prisma.document.create({
    data: {
      uploaderId,
      title: tpl.name,
      description: tpl.description,
      storagePath: tpl.koPath,
      mimeType: tpl.koMime,
      pageCount,
      storagePathEn: tpl.enPath,
      mimeTypeEn: tpl.enMime,
      templateId: tpl.id,
    },
  });

  // 본인 제외 모든 직원
  const others = await prisma.user.findMany({
    where: { id: { not: uploaderId } },
    select: { id: true },
  });

  if (others.length > 0) {
    await prisma.signatureRequest.createMany({
      data: others.map((u) => ({
        documentId: doc.id,
        requesterId: uploaderId,
        signerId: u.id,
        status: "PENDING" as const,
      })),
      skipDuplicates: true,
    });
  }

  return { documentId: doc.id, signersCount: others.length };
}

// =====================================================
// 2. 사인 요청 일괄 생성 (직원)
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
// 2-B. 외부 사인 요청 생성 (학부모 등)
// =====================================================
export type ExternalSignerInput = {
  name: string;
  email?: string;
  phone?: string;
};

function generateToken(): string {
  // 32자 랜덤 토큰
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export async function createExternalSignatureRequests(
  documentId: string,
  requesterId: string,
  externals: ExternalSignerInput[],
  /** 토큰 유효 기간 (일). 기본 30일. */
  expireDays = 30,
): Promise<{ id: string; token: string; name: string }[]> {
  if (!(await isUserAdmin(requesterId))) {
    throw new Error("관리자만 사인을 요청할 수 있습니다.");
  }
  if (externals.length === 0) return [];

  const expiresAt = new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000);

  const created = await Promise.all(
    externals.map(async (ext) => {
      const token = generateToken();
      const r = await prisma.signatureRequest.create({
        data: {
          documentId,
          requesterId,
          signerId: null,
          status: "PENDING",
          externalName: ext.name.trim(),
          externalEmail: ext.email?.trim() || null,
          externalPhone: ext.phone?.trim() || null,
          accessToken: token,
          tokenExpiresAt: expiresAt,
        },
        select: { id: true, accessToken: true, externalName: true },
      });
      return {
        id: r.id,
        token: r.accessToken!,
        name: r.externalName!,
      };
    }),
  );

  return created;
}

// =====================================================
// 3. 사인 제출 (직원 또는 외부)
// =====================================================
export type SubmitSignatureParams = {
  requestId: string;
  /** 직원 사인이면 본인 user.id, 외부면 null */
  signerId: string | null;
  /** 외부 사인의 토큰 검증을 통과한 경우만 true */
  externalToken?: string;
  signatureBase64: string; // dataURL: data:image/png;base64,...
  ip?: string;
  userAgent?: string;
};

export async function submitSignature(params: SubmitSignatureParams) {
  const {
    requestId,
    signerId,
    externalToken,
    signatureBase64,
    ip,
    userAgent,
  } = params;

  // 권한 + 상태 체크
  const req = await prisma.signatureRequest.findUnique({
    where: { id: requestId },
    include: { document: true },
  });
  if (!req) throw new Error("요청을 찾을 수 없습니다.");

  // 권한 검증: 직원 또는 외부 토큰
  if (signerId !== null) {
    if (req.signerId !== signerId) {
      throw new Error("본인의 사인 요청이 아닙니다.");
    }
  } else {
    // 외부 사인
    if (!externalToken || req.accessToken !== externalToken) {
      throw new Error("유효하지 않은 사인 링크입니다.");
    }
    if (req.tokenExpiresAt && req.tokenExpiresAt < new Date()) {
      throw new Error("사인 링크가 만료되었습니다.");
    }
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
  const sigOwner = signerId ?? `ext_${requestId}`;
  const sigPath = `${sigOwner}/${requestId}.png`;
  const { error: sigErr } = await admin.storage
    .from(SIG_BUCKET)
    .upload(sigPath, sigBuffer, {
      contentType: "image/png",
      upsert: true,
    });
  if (sigErr) throw new Error(`사인 저장 실패: ${sigErr.message}`);

  // 2) 원본 파일 다운로드
  // PDF는 사인 합성, 그 외 포맷은 원본 그대로 사용 (사인 PNG는 별도 보관)
  const isPdf = req.document.mimeType === "application/pdf";
  const { data: docFile, error: docErr } = await admin.storage
    .from(DOC_BUCKET)
    .download(req.document.storagePath);
  if (docErr || !docFile) {
    throw new Error(`원본 파일 다운로드 실패: ${docErr?.message}`);
  }
  const docBuffer = Buffer.from(await docFile.arrayBuffer());

  // 비-PDF 처리: 합성 없이 원본 경로 그대로 사용 + 사인은 별도로 저장
  if (!isPdf) {
    await prisma.signatureRequest.update({
      where: { id: requestId },
      data: {
        status: "SIGNED",
        signaturePath: sigPath,
        signedPdfPath: req.document.storagePath, // 원본을 그대로
        signedAt: new Date(),
        signerIp: ip ?? null,
        signerAgent: userAgent ?? null,
        ...(signerId === null ? { accessToken: null } : {}),
      },
    });
    return { signedPath: req.document.storagePath };
  }

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
  let signerLabel: string;
  if (signerId) {
    const signer = await prisma.user.findUnique({
      where: { id: signerId },
      select: { username: true, name: true },
    });
    signerLabel = signer?.username ?? signerId;
  } else {
    // 외부 사인자
    signerLabel = `external: ${req.externalName ?? "unknown"}`;
  }
  const now = new Date();
  const meta = [
    `Signer: ${signerLabel}`,
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
  const signerKey = signerId ?? `ext_${requestId}`;
  const signedPath = req.document.storagePath.replace(
    /\.pdf$/i,
    `__signed_${signerKey}.pdf`,
  );

  const { error: signedErr } = await admin.storage
    .from(DOC_BUCKET)
    .upload(signedPath, signedBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (signedErr) throw new Error(`합성 PDF 저장 실패: ${signedErr.message}`);

  // 5) DB 업데이트 (외부 사인 시 토큰 무효화)
  await prisma.signatureRequest.update({
    where: { id: requestId },
    data: {
      status: "SIGNED",
      signaturePath: sigPath,
      signedPdfPath: signedPath,
      signedAt: now,
      signerIp: ip ?? null,
      signerAgent: userAgent ?? null,
      ...(signerId === null
        ? { accessToken: null } // 외부 사인은 토큰 무효화 (재사용 차단)
        : {}),
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

// =====================================================
// 외부 사인: 토큰으로 요청 조회
// =====================================================
export async function getSignatureRequestByToken(token: string) {
  return prisma.signatureRequest.findFirst({
    where: { accessToken: token },
    include: {
      document: true,
      requester: { select: { name: true, username: true } },
    },
  });
}

/**
 * 문서 + 디지털 사인 헬퍼 (서버 전용)
 *
 * 흐름:
 *  1. uploadDocument: 관리자가 파일 업로드 → Document row + 스토리지 저장
 *  2. createSignatureRequests: 대상자들에게 SignatureRequest 일괄 생성
 *  3. submitSignature: 대상자가 사인 → 사인 PNG 저장 + (PDF면) 합성 PDF 생성
 *  4. getSignatureRequestForSigner / ByToken: 사인 페이지용
 *
 * 스토리지: lib/storage.ts 통해 Supabase 또는 Google Drive로 라우팅.
 * Document.storageType 필드가 어디에 저장됐는지 표시.
 */
import { prisma } from "@/lib/db";
import { PDFDocument, type PDFFont, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  type StorageType,
  deleteFiles,
  downloadFile,
  getActiveStorageType,
  getSupabaseSignedUrl,
  uploadFile,
} from "@/lib/storage";
import { loadKoreanFont } from "@/lib/fonts";

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
// =====================================================
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function safeFileName(s: string): string {
  return s.replace(/[^a-zA-Z0-9가-힣_-]/g, "_").slice(0, 30);
}

/**
 * pdf-lib StandardFonts.Helvetica는 WinAnsi(Windows-1252)만 인코딩 가능.
 * 한글 등 비라틴 문자를 그대로 drawText하면 throw됨.
 * 사용 가능한 문자는 그대로, 나머지는 '?'로 치환.
 */
function helveticaSafe(s: string): string {
  return s.replace(/[^\x20-\x7E -ÿ]/g, "?");
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
  const buffer = Buffer.from(await file.arrayBuffer());

  let pageCount: number | null = null;
  if (isPdf) {
    try {
      const pdfDoc = await PDFDocument.load(buffer);
      pageCount = pdfDoc.getPageCount();
    } catch {
      // PDF 파싱 실패 — 그래도 업로드는 진행
    }
  }

  const ts = Date.now();
  const ext = extFromName(file.name) || (isPdf ? "pdf" : "bin");
  const path = `${uploaderId}/${ts}_${safeFileName(title)}.${ext}`;
  const fileName = `${ts}_${safeFileName(title)}.${ext}`;

  const storageType = getActiveStorageType();
  const { storagePath } = await uploadFile({
    storageType,
    path,
    fileName,
    buffer,
    mimeType: file.type || "application/octet-stream",
  });

  const doc = await prisma.document.create({
    data: {
      uploaderId,
      title,
      description: description?.trim() || null,
      storagePath,
      mimeType: file.type || "application/octet-stream",
      pageCount,
      storageType,
    },
  });

  return { id: doc.id, storagePath };
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
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export async function createExternalSignatureRequests(
  documentId: string,
  requesterId: string,
  externals: ExternalSignerInput[],
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
  signerId: string | null;
  externalToken?: string;
  signatureBase64: string;
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

  const req = await prisma.signatureRequest.findUnique({
    where: { id: requestId },
    include: { document: true },
  });
  if (!req) throw new Error("요청을 찾을 수 없습니다.");

  if (signerId !== null) {
    if (req.signerId !== signerId) {
      throw new Error("본인의 사인 요청이 아닙니다.");
    }
  } else {
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

  const matches = signatureBase64.match(/^data:image\/png;base64,(.+)$/);
  if (!matches) throw new Error("사인 이미지 형식이 잘못되었습니다.");
  const sigBuffer = Buffer.from(matches[1], "base64");
  if (sigBuffer.length > 512 * 1024) {
    throw new Error("사인 이미지가 너무 큽니다.");
  }

  const docStorageType = (req.document.storageType ?? "supabase") as StorageType;

  // 1) 사인 PNG 저장 — 부모 문서와 같은 스토리지에 보관 (통합 어댑터 사용)
  const sigOwner = signerId ?? `ext_${requestId}`;
  const sigPath = `signatures/${sigOwner}/${requestId}.png`;
  const { storagePath: storedSigPath } = await uploadFile({
    storageType: docStorageType,
    path: sigPath,
    fileName: `sig_${requestId}.png`,
    buffer: sigBuffer,
    mimeType: "image/png",
  });

  // 2) 원본 파일 다운로드
  const isPdf = req.document.mimeType === "application/pdf";
  const docBuffer = await downloadFile(
    docStorageType,
    req.document.storagePath,
  );

  // 비-PDF: 원본은 보존하고 별도 "사인 증명 PDF" 생성
  if (!isPdf) {
    let signerLabelCert: string;
    if (signerId) {
      const signer = await prisma.user.findUnique({
        where: { id: signerId },
        select: { username: true, name: true },
      });
      signerLabelCert = signer?.name
        ? `${signer.name} (${signer.username ?? signerId})`
        : (signer?.username ?? signerId);
    } else {
      signerLabelCert = `External: ${req.externalName ?? "unknown"}`;
    }

    const certPdf = await PDFDocument.create();
    certPdf.registerFontkit(fontkit);

    let certFont: PDFFont;
    let certBoldFont: PDFFont;
    let useUnicodeFont = false;
    const koBytes = await loadKoreanFont();
    if (koBytes) {
      try {
        const koFont = await certPdf.embedFont(koBytes, { subset: true });
        certFont = koFont;
        certBoldFont = koFont; // Noto Sans KR Regular only — size increase serves as "bold"
        useUnicodeFont = true;
      } catch {
        certFont = await certPdf.embedFont(StandardFonts.Helvetica);
        certBoldFont = await certPdf.embedFont(StandardFonts.HelveticaBold);
      }
    } else {
      certFont = await certPdf.embedFont(StandardFonts.Helvetica);
      certBoldFont = await certPdf.embedFont(StandardFonts.HelveticaBold);
    }
    const safeText = (s: string) => (useUnicodeFont ? s : helveticaSafe(s));

    const certPage = certPdf.addPage();
    const certSig = await certPdf.embedPng(sigBuffer);
    const { width: pageW, height: pageH } = certPage.getSize();

    certPage.drawText("Signature Certificate", {
      x: 50,
      y: pageH - 80,
      size: 24,
      font: certBoldFont,
      color: rgb(0, 0, 0),
    });

    let cy = pageH - 130;
    certPage.drawText("Document", {
      x: 50,
      y: cy,
      size: 11,
      font: certBoldFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    cy -= 18;
    certPage.drawText(
      safeText(`Title: ${req.document.title}`).slice(0, 80),
      {
        x: 50,
        y: cy,
        size: 11,
        font: certFont,
      },
    );
    cy -= 16;
    certPage.drawText(`Doc ID: ${req.document.id}`, {
      x: 50,
      y: cy,
      size: 9,
      font: certFont,
      color: rgb(0.5, 0.5, 0.5),
    });
    cy -= 14;
    certPage.drawText(`Original type: ${req.document.mimeType}`, {
      x: 50,
      y: cy,
      size: 9,
      font: certFont,
      color: rgb(0.5, 0.5, 0.5),
    });

    const nowCert = new Date();
    cy -= 32;
    certPage.drawText("Signer", {
      x: 50,
      y: cy,
      size: 11,
      font: certBoldFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    cy -= 18;
    certPage.drawText(safeText(signerLabelCert).slice(0, 80), {
      x: 50,
      y: cy,
      size: 11,
      font: certFont,
    });
    cy -= 16;
    certPage.drawText(`Signed at: ${nowCert.toISOString()}`, {
      x: 50,
      y: cy,
      size: 9,
      font: certFont,
      color: rgb(0.5, 0.5, 0.5),
    });
    if (ip) {
      cy -= 14;
      certPage.drawText(`IP: ${ip}`, {
        x: 50,
        y: cy,
        size: 9,
        font: certFont,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
    if (userAgent) {
      cy -= 14;
      certPage.drawText(safeText(`Agent: ${userAgent.slice(0, 70)}`), {
        x: 50,
        y: cy,
        size: 9,
        font: certFont,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    cy -= 36;
    certPage.drawText("Signature", {
      x: 50,
      y: cy,
      size: 11,
      font: certBoldFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    const certDims = certSig.scale(1);
    const certMaxW = 300;
    const certScale =
      certDims.width > certMaxW ? certMaxW / certDims.width : 1;
    const cw = certDims.width * certScale;
    const ch = certDims.height * certScale;
    cy -= ch + 20;
    certPage.drawImage(certSig, { x: 50, y: cy, width: cw, height: ch });
    certPage.drawRectangle({
      x: 45,
      y: cy - 10,
      width: pageW - 90,
      height: ch + 30,
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 1,
    });

    certPage.drawText(
      "This certificate confirms electronic signature of the referenced document.",
      {
        x: 50,
        y: 60,
        size: 9,
        font: certFont,
        color: rgb(0.5, 0.5, 0.5),
      },
    );
    certPage.drawText(
      "The original file is stored separately and remains unchanged.",
      {
        x: 50,
        y: 46,
        size: 9,
        font: certFont,
        color: rgb(0.5, 0.5, 0.5),
      },
    );

    const certBytes = await certPdf.save();
    const certBuffer = Buffer.from(certBytes);
    const certKey = `signed/${signerId ?? `ext_${requestId}`}/${Date.now()}_certificate.pdf`;
    const { storagePath: certPath } = await uploadFile({
      storageType: docStorageType,
      path: certKey,
      fileName: `cert_${requestId}.pdf`,
      buffer: certBuffer,
      mimeType: "application/pdf",
    });

    await prisma.signatureRequest.update({
      where: { id: requestId },
      data: {
        status: "SIGNED",
        signaturePath: storedSigPath,
        signedPdfPath: certPath,
        signedAt: nowCert,
        signerIp: ip ?? null,
        signerAgent: userAgent ?? null,
        ...(signerId === null ? { accessToken: null } : {}),
      },
    });
    return { signedPath: certPath };
  }

  // 3) PDF에 사인 페이지 합성
  const pdfDoc = await PDFDocument.load(docBuffer);
  pdfDoc.registerFontkit(fontkit);
  const sigImage = await pdfDoc.embedPng(sigBuffer);

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let metaFont: PDFFont = helveticaFont;
  let pdfUseUnicode = false;
  const koBytesPdf = await loadKoreanFont();
  if (koBytesPdf) {
    try {
      metaFont = await pdfDoc.embedFont(koBytesPdf, { subset: true });
      pdfUseUnicode = true;
    } catch {
      // keep helvetica
    }
  }
  const safeMeta = (s: string) => (pdfUseUnicode ? s : helveticaSafe(s));

  const newPage = pdfDoc.addPage();
  const { height } = newPage.getSize();

  newPage.drawText("Signature", {
    x: 50,
    y: height - 80,
    size: 20,
    font: helveticaFont,
    color: rgb(0, 0, 0),
  });

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

  let signerLabel: string;
  if (signerId) {
    const signer = await prisma.user.findUnique({
      where: { id: signerId },
      select: { username: true, name: true },
    });
    signerLabel = signer?.name
      ? `${signer.name} (${signer.username ?? signerId})`
      : (signer?.username ?? signerId);
  } else {
    signerLabel = `External: ${req.externalName ?? "unknown"}`;
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
    newPage.drawText(safeMeta(line as string), {
      x: 50,
      y: metaY,
      size: 9,
      font: metaFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    metaY -= 14;
  }

  // 4) 합성된 PDF 저장 — 부모 문서와 같은 스토리지에 보관
  const signedBytes = await pdfDoc.save();
  const signedBuffer = Buffer.from(signedBytes);
  const signerKey = signerId ?? `ext_${requestId}`;
  const ts = Date.now();
  const signedFileName = `${ts}_signed_${signerKey}.pdf`;
  const signedPathInput = `signed/${signerKey}/${ts}_signed.pdf`;

  const { storagePath: signedPath } = await uploadFile({
    storageType: docStorageType,
    path: signedPathInput,
    fileName: signedFileName,
    buffer: signedBuffer,
    mimeType: "application/pdf",
  });

  // 5) DB 업데이트
  await prisma.signatureRequest.update({
    where: { id: requestId },
    data: {
      status: "SIGNED",
      signaturePath: storedSigPath,
      signedPdfPath: signedPath,
      signedAt: now,
      signerIp: ip ?? null,
      signerAgent: userAgent ?? null,
      ...(signerId === null ? { accessToken: null } : {}),
    },
  });

  return { signedPath };
}

// =====================================================
// 4. Signed URL / 다운로드 URL 생성
// 클라이언트에서 호출. Supabase는 직접 signed URL, Drive는 프록시 URL.
// =====================================================
export async function getDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds = 300,
  storageType: StorageType = "supabase",
): Promise<string> {
  if (storageType === "drive") {
    // Drive는 직접 URL을 노출하지 않음 — /api/files 프록시 라우트 사용
    // 호출자가 documentId를 알아야 하므로 이 함수는 supabase에서만 의미가 있음
    throw new Error("Drive 파일은 /api/files 라우트로 다운로드합니다.");
  }
  return getSupabaseSignedUrl(storagePath, expiresInSeconds);
}

// =====================================================
// 양식 템플릿 관련
// =====================================================
export type SaveTemplateInput = {
  uploaderId: string;
  name: string;
  description?: string;
  koFile: File;
  enFile?: File | null;
};

async function uploadOneTemplateFile(
  uploaderId: string,
  file: File,
  prefix: string,
  storageType: StorageType,
): Promise<{ path: string; mime: string; fileName: string }> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`${prefix} 파일이 20MB를 초과합니다.`);
  }
  if (file.size === 0) {
    throw new Error(`${prefix} 파일이 비어있습니다.`);
  }
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const ext = extFromName(file.name) || "bin";
  const safeBase = safeFileName(
    file.name.slice(0, file.name.lastIndexOf(".") || file.name.length),
  );
  const path = `templates/${uploaderId}/${ts}_${prefix}_${safeBase}.${ext}`;
  const driveFileName = `tpl_${ts}_${prefix}_${safeBase}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { storagePath } = await uploadFile({
    storageType,
    path,
    fileName: driveFileName,
    buffer,
    mimeType: file.type || "application/octet-stream",
  });
  return {
    path: storagePath,
    mime: file.type || "application/octet-stream",
    fileName: file.name,
  };
}

export async function saveTemplate(input: SaveTemplateInput) {
  if (!(await isUserAdmin(input.uploaderId))) {
    throw new Error("관리자만 양식을 저장할 수 있습니다.");
  }
  if (!input.name?.trim()) throw new Error("양식 이름을 입력해주세요.");

  const storageType = getActiveStorageType();
  const ko = await uploadOneTemplateFile(
    input.uploaderId,
    input.koFile,
    "ko",
    storageType,
  );
  const en = input.enFile
    ? await uploadOneTemplateFile(
        input.uploaderId,
        input.enFile,
        "en",
        storageType,
      )
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
      storageType,
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
  const storageType = (tpl.storageType ?? "supabase") as StorageType;
  const paths = [tpl.koPath, tpl.enPath].filter(Boolean) as string[];
  if (paths.length > 0) {
    await deleteFiles(storageType, paths).catch(() => {});
  }
  await prisma.documentTemplate.delete({ where: { id: templateId } });
}

/**
 * 사인 캠페인(Document) 삭제 — 관리자가 본인이 만든 캠페인만 삭제 가능.
 *
 * 함께 정리되는 것:
 * - 사인 결과 PDF (signedPdfPath) — 사인본은 캠페인 단위 결과물이라 같이 삭제
 * - 사인 이미지 (signaturePath) — 캠페인 결과물
 * - SignatureRequest 행 — Prisma onDelete: Cascade
 *
 * 보존되는 것:
 * - 양식 원본(template.koPath/enPath) — DocumentTemplate 보관함에 그대로
 *   (Document.storagePath는 template.koPath와 동일한 경로일 수 있어 직접 삭제 안 함)
 *
 * 실패 시: 일부 파일 삭제 실패해도 DB는 삭제 진행 (orphan 파일은 R2/Supabase에 남음).
 */
export async function deleteCampaign(uploaderId: string, documentId: string) {
  if (!(await isUserAdmin(uploaderId))) {
    throw new Error("관리자만 캠페인을 삭제할 수 있습니다.");
  }
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      signatureRequests: {
        select: { signedPdfPath: true, signaturePath: true },
      },
    },
  });
  if (!doc) throw new Error("캠페인을 찾을 수 없습니다.");
  if (doc.uploaderId !== uploaderId) {
    throw new Error("본인이 만든 캠페인만 삭제할 수 있습니다.");
  }

  const storageType = (doc.storageType ?? "supabase") as StorageType;
  const paths: string[] = [];
  for (const r of doc.signatureRequests) {
    if (r.signedPdfPath) paths.push(r.signedPdfPath);
    if (r.signaturePath) paths.push(r.signaturePath);
  }
  if (paths.length > 0) {
    await deleteFiles(storageType, paths).catch(() => {});
  }

  // SignatureRequest는 onDelete: Cascade 로 자동 삭제됨
  await prisma.document.delete({ where: { id: documentId } });
}

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

  const storageType = (tpl.storageType ?? "supabase") as StorageType;

  let pageCount: number | null = null;
  if (tpl.koMime === "application/pdf") {
    try {
      const buf = await downloadFile(storageType, tpl.koPath);
      pageCount = (await PDFDocument.load(buf)).getPageCount();
    } catch {}
  }

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
      storageType,
    },
  });

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
// 조회
// =====================================================
export async function getMyPendingSignatures(signerId: string) {
  return prisma.signatureRequest.findMany({
    where: { signerId, status: "PENDING" },
    include: {
      document: {
        select: {
          id: true,
          title: true,
          description: true,
          pageCount: true,
        },
      },
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
          signer: {
            select: {
              id: true,
              name: true,
              username: true,
              role: { select: { label: true } },
            },
          },
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

export async function cancelSignatureRequest(
  requestId: string,
  adminId: string,
): Promise<void> {
  if (!(await isUserAdmin(adminId))) {
    throw new Error("관리자만 사인 요청을 취소할 수 있습니다.");
  }
  const req = await prisma.signatureRequest.findUnique({
    where: { id: requestId },
    include: { document: { select: { uploaderId: true } } },
  });
  if (!req) throw new Error("요청을 찾을 수 없습니다.");
  if (req.document.uploaderId !== adminId) {
    throw new Error("본인이 보낸 요청만 취소할 수 있습니다.");
  }
  if (req.status !== "PENDING") {
    throw new Error("이미 처리된 요청은 취소할 수 없습니다.");
  }
  await prisma.signatureRequest.update({
    where: { id: requestId },
    data: {
      status: "CANCELLED",
      accessToken: null,
    },
  });
}

export async function getSignatureRequestByToken(token: string) {
  return prisma.signatureRequest.findFirst({
    where: { accessToken: token },
    include: {
      document: true,
      requester: { select: { name: true, username: true } },
    },
  });
}

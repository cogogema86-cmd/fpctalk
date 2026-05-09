/**
 * 통합 스토리지 디스패처
 *
 * 새 업로드는 STORAGE_PROVIDER 환경변수에 따라 결정:
 *   - "r2"       → Cloudflare R2 (S3 호환, 추천)
 *   - "drive"    → Google Drive (Service Account, Workspace 필요)
 *   - "supabase" → Supabase Storage (기본, 1GB 무료)
 *
 * 읽기/삭제는 storageType 파라미터(파일이 어디에 저장됐는지)에 따라 분기.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteFromDrive,
  downloadFromDrive,
  uploadToDrive,
} from "@/lib/storage-drive";
import {
  deleteFromR2,
  downloadFromR2,
  getR2SignedUrl,
  uploadToR2,
} from "@/lib/storage-r2";

export type StorageType = "supabase" | "drive" | "r2";

const SUPABASE_DOC_BUCKET = "documents";

/** 신규 업로드에 사용할 기본 스토리지 */
export function getActiveStorageType(): StorageType {
  const env = (process.env.STORAGE_PROVIDER || "supabase").toLowerCase();
  if (env === "r2") return "r2";
  if (env === "drive") return "drive";
  return "supabase";
}

/**
 * 파일 업로드.
 * - Supabase: storagePath = path
 * - Drive: storagePath = fileId
 * - R2: storagePath = key (path 그대로)
 */
export async function uploadFile(params: {
  storageType: StorageType;
  /** R2/Supabase는 이걸 그대로 key/path로 사용. Drive는 fileName만 사용 */
  path: string;
  /** Drive 표시용 파일명 */
  fileName: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<{ storagePath: string }> {
  const { storageType, path, fileName, buffer, mimeType } = params;

  if (storageType === "r2") {
    const { key } = await uploadToR2(buffer, path, mimeType);
    return { storagePath: key };
  }

  if (storageType === "drive") {
    const { fileId } = await uploadToDrive(buffer, fileName, mimeType);
    return { storagePath: fileId };
  }

  // supabase
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(SUPABASE_DOC_BUCKET)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: false,
    });
  if (error) {
    throw new Error(`Supabase 업로드 실패: ${error.message}`);
  }
  return { storagePath: path };
}

/** 파일 다운로드 → Buffer */
export async function downloadFile(
  storageType: StorageType,
  storagePath: string,
): Promise<Buffer> {
  if (storageType === "r2") return downloadFromR2(storagePath);
  if (storageType === "drive") return downloadFromDrive(storagePath);

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(SUPABASE_DOC_BUCKET)
    .download(storagePath);
  if (error || !data) {
    throw new Error(`Supabase 다운로드 실패: ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/** 파일 삭제 (실패해도 무시 OK 호출자가 catch) */
export async function deleteFiles(
  storageType: StorageType,
  storagePaths: string[],
): Promise<void> {
  if (storagePaths.length === 0) return;

  if (storageType === "r2") {
    await deleteFromR2(storagePaths);
    return;
  }

  if (storageType === "drive") {
    await Promise.allSettled(storagePaths.map((id) => deleteFromDrive(id)));
    return;
  }

  const admin = createAdminClient();
  await admin.storage.from(SUPABASE_DOC_BUCKET).remove(storagePaths);
}

/** Supabase 직접 다운로드 URL (5분 유효) */
export async function getSupabaseSignedUrl(
  storagePath: string,
  expiresInSeconds = 300,
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(SUPABASE_DOC_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data) throw new Error(`URL 발급 실패: ${error?.message}`);
  return data.signedUrl;
}

/**
 * 스토리지 종류에 맞는 다운로드 URL 발급.
 * - Supabase / R2: signed URL로 직접 redirect 가능
 * - Drive: 직접 URL 없음 → null 반환 (호출자가 프록시 스트리밍)
 */
export async function getDirectSignedUrl(
  storageType: StorageType,
  storagePath: string,
  expiresInSeconds = 300,
): Promise<string | null> {
  if (storageType === "r2") {
    return getR2SignedUrl(storagePath, expiresInSeconds);
  }
  if (storageType === "supabase") {
    return getSupabaseSignedUrl(storagePath, expiresInSeconds);
  }
  return null; // drive
}

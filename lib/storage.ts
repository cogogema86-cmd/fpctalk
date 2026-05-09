/**
 * 통합 스토리지 디스패처
 *
 * 새 업로드는 STORAGE_PROVIDER 환경변수에 따라 결정:
 *   - "drive"   → Google Drive
 *   - "supabase"(기본) → Supabase Storage
 *
 * 읽기/삭제는 storageType 파라미터(파일이 어디에 저장됐는지)에 따라 분기.
 * 기존 supabase 파일도 그대로 동작.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteFromDrive,
  downloadFromDrive,
  uploadToDrive,
} from "@/lib/storage-drive";

export type StorageType = "supabase" | "drive";

const SUPABASE_DOC_BUCKET = "documents";

/** 신규 업로드에 사용할 기본 스토리지 */
export function getActiveStorageType(): StorageType {
  const env = (process.env.STORAGE_PROVIDER || "supabase").toLowerCase();
  return env === "drive" ? "drive" : "supabase";
}

/**
 * 파일 업로드.
 * - Supabase: storagePath = 우리가 정한 path
 * - Drive: storagePath = Drive가 발급한 fileId (path 무시)
 */
export async function uploadFile(params: {
  storageType: StorageType;
  /** Supabase 경로 (Drive에서는 무시) — Drive는 fileName만 사용 */
  path: string;
  /** Drive 표시용 파일명 */
  fileName: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<{ storagePath: string }> {
  const { storageType, path, fileName, buffer, mimeType } = params;

  if (storageType === "drive") {
    const { fileId } = await uploadToDrive(buffer, fileName, mimeType);
    return { storagePath: fileId };
  }

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

/**
 * 파일 다운로드 → Buffer
 * Drive는 fileId, Supabase는 path
 */
export async function downloadFile(
  storageType: StorageType,
  storagePath: string,
): Promise<Buffer> {
  if (storageType === "drive") {
    return downloadFromDrive(storagePath);
  }
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(SUPABASE_DOC_BUCKET)
    .download(storagePath);
  if (error || !data) {
    throw new Error(`Supabase 다운로드 실패: ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/**
 * 파일 삭제 (실패해도 무시 OK 호출자가 catch)
 */
export async function deleteFiles(
  storageType: StorageType,
  storagePaths: string[],
): Promise<void> {
  if (storagePaths.length === 0) return;
  if (storageType === "drive") {
    await Promise.allSettled(storagePaths.map((id) => deleteFromDrive(id)));
    return;
  }
  const admin = createAdminClient();
  await admin.storage.from(SUPABASE_DOC_BUCKET).remove(storagePaths);
}

/**
 * Supabase 직접 다운로드 URL (5분 유효)
 * Drive는 이걸 사용하지 않음 (대신 /api/files 라우트로 프록시)
 */
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

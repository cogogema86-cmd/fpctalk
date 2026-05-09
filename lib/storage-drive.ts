/**
 * Google Drive 스토리지 어댑터
 *
 * 환경변수:
 *   GOOGLE_DRIVE_CREDENTIALS_JSON  Service Account JSON 전체 (한 줄 문자열)
 *   GOOGLE_DRIVE_FOLDER_ID         Drive 안의 루트 폴더 ID
 *
 * 모든 파일은 GOOGLE_DRIVE_FOLDER_ID 폴더 안에 평면적으로 저장.
 * Drive에 저장된 파일의 fileId가 storagePath로 DB에 보관됨.
 */
import { google, type drive_v3 } from "googleapis";
import { Readable } from "node:stream";

let cached: drive_v3.Drive | null = null;

function getDrive(): drive_v3.Drive {
  if (cached) return cached;
  const raw = process.env.GOOGLE_DRIVE_CREDENTIALS_JSON;
  if (!raw) {
    throw new Error("GOOGLE_DRIVE_CREDENTIALS_JSON 환경변수가 설정되지 않았습니다.");
  }
  let credentials: unknown;
  try {
    credentials = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `GOOGLE_DRIVE_CREDENTIALS_JSON 파싱 실패: ${e instanceof Error ? e.message : "알 수 없음"}`,
    );
  }
  const auth = new google.auth.GoogleAuth({
    credentials: credentials as Record<string, unknown>,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  cached = google.drive({ version: "v3", auth });
  return cached;
}

function getRootFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!id) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID 환경변수가 설정되지 않았습니다.");
  }
  return id;
}

/**
 * Drive에 파일 업로드 → fileId 반환
 */
export async function uploadToDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<{ fileId: string }> {
  const drive = getDrive();
  const folderId = getRootFolderId();

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id",
    supportsAllDrives: true,
  });

  if (!res.data.id) {
    throw new Error("Drive 업로드 응답에 fileId가 없습니다.");
  }
  return { fileId: res.data.id };
}

/**
 * Drive에서 파일 다운로드 → Buffer
 */
export async function downloadFromDrive(fileId: string): Promise<Buffer> {
  const drive = getDrive();
  const res = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true,
    },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(res.data as ArrayBuffer);
}

/**
 * Drive 파일 메타데이터 (이름, mimeType, 크기 등)
 */
export async function getDriveFileMetadata(fileId: string) {
  const drive = getDrive();
  const res = await drive.files.get({
    fileId,
    fields: "id, name, mimeType, size",
    supportsAllDrives: true,
  });
  return res.data;
}

/**
 * Drive 파일 삭제 (404는 무시)
 */
export async function deleteFromDrive(fileId: string): Promise<void> {
  const drive = getDrive();
  try {
    await drive.files.delete({ fileId, supportsAllDrives: true });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code !== 404) throw e;
  }
}

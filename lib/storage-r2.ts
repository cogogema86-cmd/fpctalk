/**
 * Cloudflare R2 스토리지 어댑터 (S3 호환 API)
 *
 * 환경변수:
 *   R2_ACCOUNT_ID         Cloudflare 계정 ID
 *   R2_ACCESS_KEY_ID      R2 API 토큰의 Access Key
 *   R2_SECRET_ACCESS_KEY  R2 API 토큰의 Secret Key
 *   R2_BUCKET             버킷 이름 (예: "fpctalk")
 *
 * 모든 파일은 R2 버킷에 평면적으로 저장 (key 경로로 폴더 구조 흉내).
 */
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let cached: S3Client | null = null;

function getR2(): S3Client {
  if (cached) return cached;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY 환경변수가 모두 설정되어야 합니다.",
    );
  }
  const config: S3ClientConfig = {
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  };
  cached = new S3Client(config);
  return cached;
}

function getR2Bucket(): string {
  const b = process.env.R2_BUCKET;
  if (!b) throw new Error("R2_BUCKET 환경변수가 설정되지 않았습니다.");
  return b;
}

/** R2에 파일 업로드 → key 반환 (key가 곧 storagePath) */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<{ key: string }> {
  const client = getR2();
  await client.send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
  return { key };
}

/** R2에서 파일 다운로드 → Buffer */
export async function downloadFromR2(key: string): Promise<Buffer> {
  const client = getR2();
  const res = await client.send(
    new GetObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
    }),
  );
  if (!res.Body) throw new Error("R2 응답 Body 비어있음");

  // res.Body is a stream — convert to Buffer
  const stream = res.Body as AsyncIterable<Uint8Array>;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** R2 임시 다운로드 URL (5분 기본) */
export async function getR2SignedUrl(
  key: string,
  expiresIn = 300,
): Promise<string> {
  const client = getR2();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
    }),
    { expiresIn },
  );
}

export type R2Usage = {
  totalBytes: number;
  objectCount: number;
  /** 최상위 접두사(첫 경로 세그먼트)별 합계 — 종류별 분류용 */
  byPrefix: Record<string, { bytes: number; count: number }>;
};

/**
 * R2 버킷 전체 사용량 집계 — 객체 목록을 페이지네이션하며 Size 합산.
 * 학원 규모(수백~수천 객체)에선 빠르고 무료(R2 Class B 작업).
 */
export async function getR2Usage(): Promise<R2Usage> {
  const client = getR2();
  const bucket = getR2Bucket();
  let totalBytes = 0;
  let objectCount = 0;
  const byPrefix: Record<string, { bytes: number; count: number }> = {};
  let token: string | undefined = undefined;

  do {
    const res: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    );
    for (const obj of res.Contents ?? []) {
      const size = obj.Size ?? 0;
      totalBytes += size;
      objectCount += 1;
      const prefix = (obj.Key ?? "").split("/")[0] || "(root)";
      const slot = byPrefix[prefix] ?? { bytes: 0, count: 0 };
      slot.bytes += size;
      slot.count += 1;
      byPrefix[prefix] = slot;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return { totalBytes, objectCount, byPrefix };
}

/** R2 파일 삭제 (여러 개 batch) */
export async function deleteFromR2(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const client = getR2();
  await client.send(
    new DeleteObjectsCommand({
      Bucket: getR2Bucket(),
      Delete: {
        Objects: keys.map((Key) => ({ Key })),
        Quiet: true,
      },
    }),
  );
}

/**
 * Korean font loader for pdf-lib.
 *
 * 1순위: repo에 번들된 OTF를 파일시스템에서 읽음 (assets/NotoSansKR-Regular.otf).
 *        CDN 의존이 없어 사인본/증명서 PDF의 한글이 항상 안정적으로 렌더된다.
 *        (Vercel 함수 번들 포함은 next.config.ts outputFileTracingIncludes로 보장)
 * 2순위: 로컬 파일이 없으면 jsDelivr/raw.githubusercontent CDN에서 fetch.
 *
 * pdf-lib가 사용된 글리프만 subset 임베드하므로 생성 PDF 용량은 작다.
 * 모두 실패하면 null 반환 → 호출부는 ASCII-safe 렌더로 폴백.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const LOCAL_FONT_PATH = path.join(
  process.cwd(),
  "assets",
  "NotoSansKR-Regular.otf",
);

const KO_FONT_URLS = [
  "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/KR/NotoSansKR-Regular.otf",
  "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/KR/NotoSansKR-Regular.otf",
];

let cached: Buffer | null = null;
let inFlight: Promise<Buffer | null> | null = null;

export async function loadKoreanFont(): Promise<Buffer | null> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    // 1) 로컬 번들 폰트
    try {
      const buf = await readFile(LOCAL_FONT_PATH);
      if (buf.byteLength > 100_000) {
        cached = buf;
        return buf;
      }
    } catch {
      // 파일 없음 → CDN 폴백
    }

    // 2) CDN 폴백
    for (const url of KO_FONT_URLS) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.byteLength < 100_000) continue; // sanity: real font is ~5MB
        cached = buf;
        return buf;
      } catch {
        // try next URL
      }
    }
    return null;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

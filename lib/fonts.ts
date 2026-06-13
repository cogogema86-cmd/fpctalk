/**
 * Korean font loader for pdf-lib.
 *
 * 1순위: repo에 번들된 나눔고딕 TTF (assets/NanumGothic-Regular.ttf, 현대 한글 11,172자 전부 포함).
 *        CDN 의존이 없어 사인본/증명서 PDF의 한글이 항상 안정적으로 렌더된다.
 *        (Vercel 함수 번들 포함은 next.config.ts outputFileTracingIncludes로 보장)
 * 2순위: 로컬 파일이 없으면 CDN(google/fonts NanumGothic)에서 fetch.
 *
 * ⚠️ notofonts의 SubsetOTF는 글리프 일부만 들어있어(한글 깨짐) 쓰면 안 됨.
 *    전체 커버리지 폰트(나눔고딕)를 사용한다.
 *
 * pdf-lib가 사용된 글리프만 subset 임베드하므로 생성 PDF 용량은 작다.
 * 모두 실패하면 null 반환 → 호출부는 ASCII-safe 렌더로 폴백.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const LOCAL_FONT_PATH = path.join(
  process.cwd(),
  "assets",
  "NanumGothic-Regular.ttf",
);

const KO_FONT_URLS = [
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-Regular.ttf",
  "https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Regular.ttf",
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
        if (buf.byteLength < 100_000) continue; // sanity: real font is ~2MB
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

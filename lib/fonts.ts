/**
 * Korean font loader for pdf-lib.
 *
 * Fetches Noto Sans KR Regular OTF on first call from jsDelivr (mirror of
 * notofonts/noto-cjk). Cached in module memory; ~5MB but pdf-lib subsets to
 * only the glyphs used, so the embedded copy in each generated PDF is tiny.
 *
 * If the fetch fails (CDN down, offline build, etc.), `loadKoreanFont` returns
 * null and callers fall back to ASCII-safe rendering.
 */

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
    for (const url of KO_FONT_URLS) {
      try {
        const res = await fetch(url, {
          // 5-minute timeout via AbortSignal
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

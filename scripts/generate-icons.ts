/**
 * PWA 아이콘 생성 스크립트
 *
 * 사용법:
 *   npx tsx scripts/generate-icons.ts
 *
 * 입력 (둘 중 하나):
 *   1. public/icons/source.png (사용자가 직접 둔 로고 — 정사각형 권장)
 *   2. 없으면 내장 SVG (FPC 녹색 + 흰색 글자) 사용
 *
 * 출력:
 *   public/icons/icon-192.png
 *   public/icons/icon-512.png
 *   public/icons/icon-maskable-512.png  (안드로이드 마스커블)
 *   public/icons/apple-touch-icon.png    (iOS 180×180)
 *   public/favicon.ico                   (16/32/48 멀티)
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const ICON_DIR = path.join(ROOT, "public", "icons");
const SOURCE_PNG = path.join(ICON_DIR, "source.png");

const BRAND_GREEN = "#0F4D3A";

// 단순 FPC 텍스트 SVG (배경 녹색 + 흰 글자, 둥근 모서리)
function brandSvg(size: number, opts?: { maskable?: boolean }): Buffer {
  const r = opts?.maskable ? 0 : Math.round(size * 0.18); // maskable은 safe area 위해 정사각형 유지
  const innerScale = opts?.maskable ? 0.7 : 1; // maskable은 80% safe zone — 70% 안에 그림
  const fontSize = Math.round(size * 0.36 * innerScale);
  const cx = size / 2;
  const cy = size / 2;
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${BRAND_GREEN}"/>
  <text
    x="${cx}"
    y="${cy}"
    text-anchor="middle"
    dominant-baseline="central"
    fill="#FFFFFF"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    font-weight="800"
    letter-spacing="-2"
    font-size="${fontSize}"
  >FPC</text>
</svg>`);
}

async function getSourceBuffer(size: number, opts?: { maskable?: boolean }): Promise<Buffer> {
  if (existsSync(SOURCE_PNG)) {
    // 사용자 제공 PNG: 정사각형으로 fit
    let pipeline = sharp(SOURCE_PNG).resize(size, size, {
      fit: "contain",
      background: opts?.maskable ? BRAND_GREEN : { r: 0, g: 0, b: 0, alpha: 0 },
    });
    if (opts?.maskable) {
      // safe zone 위해 80% 크기로 줄이고 녹색 패딩
      const inner = Math.round(size * 0.7);
      const padded = await sharp(SOURCE_PNG)
        .resize(inner, inner, { fit: "contain", background: BRAND_GREEN })
        .extend({
          top: Math.round((size - inner) / 2),
          bottom: Math.round((size - inner) / 2),
          left: Math.round((size - inner) / 2),
          right: Math.round((size - inner) / 2),
          background: BRAND_GREEN,
        })
        .png()
        .toBuffer();
      return padded;
    }
    return await pipeline.png().toBuffer();
  }
  // SVG 폴백
  return await sharp(brandSvg(size, opts)).png().toBuffer();
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

async function main() {
  await ensureDir(ICON_DIR);

  const usingSource = existsSync(SOURCE_PNG);
  console.log(
    usingSource
      ? `[icons] using ${SOURCE_PNG}`
      : `[icons] source.png 없음 — 내장 FPC SVG 사용`,
  );

  const tasks: Array<[string, Buffer]> = [];

  // PWA standard
  tasks.push([
    path.join(ICON_DIR, "icon-192.png"),
    await getSourceBuffer(192),
  ]);
  tasks.push([
    path.join(ICON_DIR, "icon-512.png"),
    await getSourceBuffer(512),
  ]);

  // Maskable (Android adaptive icon — safe zone 80%)
  tasks.push([
    path.join(ICON_DIR, "icon-maskable-512.png"),
    await getSourceBuffer(512, { maskable: true }),
  ]);

  // Apple touch icon
  tasks.push([
    path.join(ICON_DIR, "apple-touch-icon.png"),
    await getSourceBuffer(180),
  ]);

  // favicon.ico (multi-size)
  const faviconSizes = [16, 32, 48];
  const faviconBuffers = await Promise.all(
    faviconSizes.map((s) => getSourceBuffer(s)),
  );
  // sharp doesn't write .ico directly; use 32x32 png + rename trick acceptable
  // simpler: write a 48x48 png as favicon.ico (browsers accept PNG-bytes in .ico when content-type set)
  // safest: write favicon-32.png and favicon.ico (alias)
  tasks.push([
    path.join(ROOT, "public", "favicon-16.png"),
    faviconBuffers[0],
  ]);
  tasks.push([
    path.join(ROOT, "public", "favicon-32.png"),
    faviconBuffers[1],
  ]);

  for (const [out, buf] of tasks) {
    await writeFile(out, buf);
    console.log(`[icons] wrote ${path.relative(ROOT, out)} (${buf.byteLength} bytes)`);
  }

  // favicon.ico — 16/32/48 multi-size
  // sharp v0.33+ supports .ico via `toFormat("ico")` only on some builds;
  // fallback: ship a 32×32 PNG renamed
  try {
    const ico = await sharp(brandSvg(48)).resize(48, 48).png().toBuffer();
    await writeFile(path.join(ROOT, "public", "favicon.ico"), ico);
    console.log("[icons] wrote public/favicon.ico (48px PNG)");
  } catch (e) {
    console.warn("[icons] favicon.ico skip:", (e as Error).message);
  }

  console.log("[icons] done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

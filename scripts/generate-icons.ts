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
const BRAND_GREEN_DARK = "#0a3527";
const BRAND_GREEN_LIGHT = "#1a6b50";
const BRAND_GOLD = "#F4C842";

/**
 * 폴백 아이콘 SVG: 녹색 라운드 박스 + 말풍선 실루엣 + 흰 "FPC" 텍스트
 *  - maskable: 80% safe zone 안에 그림 + 정사각형 (rx=0)
 *  - 일반: 둥근 모서리 (rx 18%)
 */
function brandSvg(size: number, opts?: { maskable?: boolean }): Buffer {
  const maskable = !!opts?.maskable;
  const cornerR = maskable ? 0 : Math.round(size * 0.22);

  // 작도 영역 (maskable이면 70% 박스 안)
  const innerScale = maskable ? 0.7 : 0.86;
  const inner = size * innerScale;
  const ox = (size - inner) / 2;
  const oy = (size - inner) / 2;

  // 말풍선 (둥근 사각형 + 꼬리)
  const bx = ox + inner * 0.1;
  const by = oy + inner * 0.18;
  const bw = inner * 0.8;
  const bh = inner * 0.55;
  const br = inner * 0.14;
  // 꼬리 좌표 (왼쪽 아래)
  const tailX1 = bx + bw * 0.18;
  const tailY1 = by + bh;
  const tailX2 = bx + bw * 0.05;
  const tailY2 = by + bh + inner * 0.14;
  const tailX3 = bx + bw * 0.32;
  const tailY3 = by + bh;

  // 텍스트 — 말풍선 가운데
  const fontSize = inner * 0.28;
  const tx = bx + bw / 2;
  const ty = by + bh / 2;

  // 하단 강조 점 3개 (메시지/타이핑 느낌)
  const dotY = oy + inner * 0.92;
  const dotR = inner * 0.025;
  const dotSpacing = inner * 0.09;
  const dotCx = size / 2;

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BRAND_GREEN_LIGHT}"/>
      <stop offset="100%" stop-color="${BRAND_GREEN_DARK}"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${size * 0.012}"/>
      <feOffset dx="0" dy="${size * 0.008}" result="off"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- 배경: 둥근 모서리 + 그라데이션 -->
  <rect x="0" y="0" width="${size}" height="${size}" rx="${cornerR}" ry="${cornerR}" fill="url(#bg)"/>

  <!-- 말풍선 본체 + 꼬리 (흰색) -->
  <g filter="url(#shadow)">
    <path d="
      M ${bx + br} ${by}
      L ${bx + bw - br} ${by}
      Q ${bx + bw} ${by} ${bx + bw} ${by + br}
      L ${bx + bw} ${by + bh - br}
      Q ${bx + bw} ${by + bh} ${bx + bw - br} ${by + bh}
      L ${tailX3} ${tailY3}
      L ${tailX2} ${tailY2}
      L ${tailX1} ${tailY1}
      L ${bx + br} ${by + bh}
      Q ${bx} ${by + bh} ${bx} ${by + bh - br}
      L ${bx} ${by + br}
      Q ${bx} ${by} ${bx + br} ${by}
      Z
    " fill="#FFFFFF"/>
  </g>

  <!-- FPC 텍스트 (말풍선 안, 진한 녹색) -->
  <text
    x="${tx}"
    y="${ty}"
    text-anchor="middle"
    dominant-baseline="central"
    fill="${BRAND_GREEN}"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    font-weight="900"
    letter-spacing="${-fontSize * 0.04}"
    font-size="${fontSize}"
  >FPC</text>

  <!-- 하단 타이핑 점 3개 (골드) -->
  <circle cx="${dotCx - dotSpacing}" cy="${dotY}" r="${dotR}" fill="${BRAND_GOLD}"/>
  <circle cx="${dotCx}" cy="${dotY}" r="${dotR}" fill="${BRAND_GOLD}"/>
  <circle cx="${dotCx + dotSpacing}" cy="${dotY}" r="${dotR}" fill="${BRAND_GOLD}"/>
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

  // Apple touch icons — iOS는 다양한 디바이스 사이즈를 link로 명시해야 안정적으로 잡힘.
  // iPad Pro 12.9 = 167, iPad = 152, iPhone = 180, 구형 iPhone = 120.
  tasks.push([
    path.join(ICON_DIR, "apple-touch-icon.png"), // 기본 180
    await getSourceBuffer(180),
  ]);
  tasks.push([
    path.join(ICON_DIR, "apple-touch-icon-180.png"),
    await getSourceBuffer(180),
  ]);
  tasks.push([
    path.join(ICON_DIR, "apple-touch-icon-167.png"),
    await getSourceBuffer(167),
  ]);
  tasks.push([
    path.join(ICON_DIR, "apple-touch-icon-152.png"),
    await getSourceBuffer(152),
  ]);
  tasks.push([
    path.join(ICON_DIR, "apple-touch-icon-120.png"),
    await getSourceBuffer(120),
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

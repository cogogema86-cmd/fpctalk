import type { NextConfig } from "next";

// 전역 보안 응답 헤더 — 외부 공격(클릭재킹·MIME 스니핑·정보 누출) 완화
const securityHeaders = [
  // MIME 스니핑 차단 (선언된 Content-Type 강제)
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 클릭재킹 방지 (동일 출처 iframe만 허용 — 내부 PDF 미리보기용)
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Referrer 최소화
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // HTTPS 강제 (Vercel은 전구간 HTTPS)
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // 불필요한 브라우저 권한 차단
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

// 사용자 업로드 파일을 서빙하는 라우트 — SVG/HTML 내 스크립트 실행 차단(저장형 XSS 방지).
// CSP sandbox는 직접 탐색/iframe 시에만 적용되어 정상 <img> 표시는 영향 없음.
const uploadFileCsp = [
  {
    key: "Content-Security-Policy",
    value: "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig: NextConfig = {
  // 서버 종류/버전 노출 헤더 제거
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // 양식 업로드(이미지/PDF/HWP 등)는 서버 액션으로 파일을 전송한다.
      // 기본 1MB 제한이면 1MB 넘는 사진 양식이 400으로 실패하므로 20MB로 상향.
      // (이미지는 업로드 폼에서 클라이언트 축소도 하지만, 안전 마진)
      bodySizeLimit: "20mb",
    },
  },
  // 사인본/증명서 PDF의 한글 폰트(assets/NanumGothic-Regular.ttf)를
  // 모든 서버 함수 번들에 포함 — lib/fonts.ts가 파일시스템에서 읽음.
  outputFileTracingIncludes: {
    "/**": ["./assets/NanumGothic-Regular.ttf"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/files/:path*", headers: uploadFileCsp },
      { source: "/api/chat/file/:path*", headers: uploadFileCsp },
      { source: "/api/sign-files/:path*", headers: uploadFileCsp },
    ];
  },
};

export default nextConfig;

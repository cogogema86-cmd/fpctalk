import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 양식 업로드(이미지/PDF/HWP 등)는 서버 액션으로 파일을 전송한다.
      // 기본 1MB 제한이면 1MB 넘는 사진 양식이 400으로 실패하므로 20MB로 상향.
      // (이미지는 업로드 폼에서 클라이언트 축소도 하지만, 안전 마진)
      bodySizeLimit: "20mb",
    },
  },
  // 사인본/증명서 PDF의 한글 폰트(assets/NotoSansKR-Regular.otf)를
  // 모든 서버 함수 번들에 포함 — lib/fonts.ts가 파일시스템에서 읽음.
  outputFileTracingIncludes: {
    "/**": ["./assets/NotoSansKR-Regular.otf"],
  },
};

export default nextConfig;

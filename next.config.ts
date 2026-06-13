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
};

export default nextConfig;

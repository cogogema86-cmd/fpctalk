/**
 * 이미지 파일을 클라이언트에서 축소(긴 변 2200px, JPEG 0.85)해 업로드 용량을 줄인다.
 * - 폰 사진(수 MB)이 서버 액션 본문 제한·플랫폼 한도를 넘지 않도록.
 * - 이미지가 아니거나(또는 압축 실패/효과 없음) PDF·HWP 등은 원본 그대로 반환.
 * (양식 업로드/편집 폼에서 공용)
 */
export async function maybeCompressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // GIF(애니메이션)·SVG는 캔버스 변환이 부적절 — 원본 유지
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 2200;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
    );
    bitmap.close?.();
    if (!blob || blob.size >= file.size) return file; // 효과 없으면 원본
    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file; // HEIC 등 디코드 실패 시 원본 (서버 액션 20MB 한도가 받쳐줌)
  }
}

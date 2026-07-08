"use client";

/**
 * PDF 인라인 뷰어 — pdf.js로 각 페이지를 캔버스에 그려 화면 폭에 맞춰 표시.
 *
 * iframe PDF는 iOS 사파리에서 원본 크기 그대로 잘려 보이는 제약이 있어
 * (축소·스크롤 불가) 모바일에서 문서 전체를 볼 수 없음.
 * → 페이지를 직접 렌더링해서 폭 맞춤 + 전체 페이지 세로 나열.
 * 확대는 브라우저 기본 핀치줌 사용.
 */

import { useEffect, useRef, useState } from "react";

export function PdfViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    (async () => {
      try {
        // legacy 빌드 — 구형 브라우저(오래된 iOS 사파리 등)용으로 트랜스파일된 버전.
        // 기본 빌드는 최신 JS API(Map.getOrInsertComputed 등)를 써서 구형 엔진에서 죽음.
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;

        // 표시 폭 = 컨테이너 폭. 선명도를 위해 devicePixelRatio(최대 2배)로 렌더.
        const displayWidth = container.clientWidth || 320;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = (displayWidth / base.width) * dpr;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.display = "block";
          if (n > 1) canvas.style.borderTop = "1px solid #e4e4e7";

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          container.appendChild(canvas);
        }
        setStatus("ready");
      } catch (e) {
        console.error("[pdf-viewer]", e);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      // 다시 마운트될 때 페이지가 중복으로 쌓이지 않도록 비움
      container.replaceChildren();
    };
  }, [url]);

  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white overflow-hidden">
      {status === "loading" && (
        <div className="p-8 text-center text-sm text-zinc-400">
          문서 불러오는 중... / Loading document...
        </div>
      )}
      {status === "error" && (
        <div className="p-6 text-center text-sm text-zinc-500">
          미리보기를 불러오지 못했습니다. 위의 &quot;새 창에서 열기&quot;
          버튼을 이용해주세요.
          <br />
          Preview unavailable — please use the &quot;open in new window&quot;
          button above.
        </div>
      )}
      <div ref={containerRef} />
    </div>
  );
}

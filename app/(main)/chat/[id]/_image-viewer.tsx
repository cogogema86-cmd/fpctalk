"use client";

/**
 * 앱 내 이미지 뷰어 (라이트박스).
 *
 * 채팅 이미지를 탭하면 iOS 네이티브 다운로드 화면으로 보내지 않고 앱 안에서 전체화면으로 띄운다.
 *  - 우측 상단 X / 배경 탭 / Esc 로 닫기 (앱에 갇히지 않음)
 *  - '공유 / 저장' → Web Share API(navigator.share)로 iOS 공유시트(카톡·사진 저장 등) 직행.
 *    공유 시트는 사용자 제스처 안에서 호출돼야 하므로, 마운트 시 미리 blob을 받아 File을 준비해 둔다.
 *  - Web Share 미지원(데스크톱 등) → 다운로드 URL을 새 탭으로 폴백.
 */

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

export function ImageViewer({
  viewUrl,
  downloadUrl,
  name,
  onClose,
}: {
  /** 인라인 표시용 URL (이미지 src) */
  viewUrl: string;
  /** 같은 출처로 스트리밍되는 다운로드 URL (blob fetch·폴백용) */
  downloadUrl: string;
  name: string;
  onClose: () => void;
}) {
  const t = useT();
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [sharePending, setSharePending] = useState(false);

  // 공유용 File 미리 준비 (사용자 제스처 안에서 navigator.share를 동기 호출하기 위함)
  useEffect(() => {
    let alive = true;
    fetch(downloadUrl)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!alive || !b) return;
        setShareFile(
          new File([b], name || "image.jpg", {
            type: b.type || "image/jpeg",
          }),
        );
      })
      .catch(() => {
        // 무시 — 공유 시 폴백(새 탭)로 처리
      });
    return () => {
      alive = false;
    };
  }, [downloadUrl, name]);

  // Esc 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const handleShare = async () => {
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
    };
    // 준비된 File이 있고 Web Share(파일) 지원 시 → 공유 시트
    if (
      shareFile &&
      typeof nav.share === "function" &&
      nav.canShare?.({ files: [shareFile] })
    ) {
      try {
        await nav.share({ files: [shareFile], title: name });
      } catch {
        // 사용자가 취소했거나 실패 — 조용히 무시
      }
      return;
    }
    // 폴백: 새 탭으로 다운로드 (앱은 유지)
    window.open(downloadUrl, "_blank", "noopener,noreferrer");
  };

  const onShareClick = async () => {
    setSharePending(true);
    try {
      await handleShare();
    } finally {
      setSharePending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/90"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* 상단 바 — 닫기 X */}
      <div className="flex justify-end p-3 shrink-0">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("chat.imgClose")}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white text-xl hover:bg-white/25"
        >
          ✕
        </button>
      </div>

      {/* 이미지 — 탭은 이미지 자신에선 닫기 무시, 배경 탭은 닫기 */}
      <div className="flex-1 min-h-0 flex items-center justify-center overflow-auto px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={viewUrl}
          alt={name}
          onClick={(e) => e.stopPropagation()}
          className="max-w-full max-h-full object-contain select-none"
        />
      </div>

      {/* 하단 — 공유 / 저장 */}
      <div
        className="p-4 flex justify-center shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onShareClick}
          disabled={sharePending}
          className="inline-flex items-center gap-2 rounded-full bg-white text-zinc-900 px-6 py-2.5 text-sm font-medium shadow-lg hover:bg-zinc-100 disabled:opacity-60"
        >
          📤{" "}
          {sharePending && !shareFile
            ? t("chat.imgSharePreparing")
            : t("chat.imgShare")}
        </button>
      </div>
    </div>
  );
}

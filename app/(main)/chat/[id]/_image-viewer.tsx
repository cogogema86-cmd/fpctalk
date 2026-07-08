"use client";

/**
 * 앱 내 이미지 뷰어 (라이트박스) — 채팅방 전체 사진 갤러리.
 *
 * 채팅 이미지를 탭하면 iOS 네이티브 다운로드 화면으로 보내지 않고 앱 안에서 전체화면으로 띄운다.
 *  - 채팅방의 모든 사진(items)을 좌우 스와이프 / 화살표 버튼 / ←→ 키로 넘겨봄 (카카오톡 방식)
 *  - 상단에 "3 / 12" 위치 카운터
 *  - 우측 상단 X / 배경 탭 / Esc 로 닫기 (앱에 갇히지 않음)
 *  - '공유 / 저장' → Web Share API(navigator.share)로 iOS 공유시트(카톡·사진 저장 등) 직행.
 *    공유 시트는 사용자 제스처 안에서 호출돼야 하므로, 사진이 바뀔 때마다 미리 blob을 받아 File을 준비해 둔다.
 *  - Web Share 미지원(데스크톱 등) → 다운로드 URL을 새 탭으로 폴백.
 */

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";

export type ViewerItem = {
  /** 인라인 표시용 URL (이미지 src) */
  viewUrl: string;
  /** 같은 출처로 스트리밍되는 다운로드 URL (blob fetch·폴백용) */
  downloadUrl: string;
  name: string;
};

export function ImageViewer({
  items,
  initialIndex,
  onClose,
}: {
  /** 채팅방의 사진 목록 (시간순) */
  items: ViewerItem[];
  /** 처음 열 사진 인덱스 */
  initialIndex: number;
  onClose: () => void;
}) {
  const t = useT();
  const [index, setIndex] = useState(initialIndex);
  const current = items[Math.min(index, items.length - 1)];
  // 준비된 공유용 File — 어떤 URL의 것인지 함께 저장해서, 사진을 넘긴 직후
  // 이전 사진의 File을 잘못 공유하지 않도록 함 (URL 불일치 시 무시)
  const [share, setShare] = useState<{ url: string; file: File } | null>(null);
  const shareFile = share?.url === current.downloadUrl ? share.file : null;
  const [sharePending, setSharePending] = useState(false);
  // 스와이프 시작 좌표 (세로 스크롤 제스처와 구분하기 위해 x·y 모두 기록)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;
  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(items.length - 1, i + 1));

  // 공유용 File 미리 준비 (사용자 제스처 안에서 navigator.share를 동기 호출하기 위함)
  // 사진이 바뀔 때마다 현재 사진의 File을 새로 준비 (URL과 함께 저장)
  useEffect(() => {
    let alive = true;
    const url = current.downloadUrl;
    fetch(url)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!alive || !b) return;
        setShare({
          url,
          file: new File([b], current.name || "image.jpg", {
            type: b.type || "image/jpeg",
          }),
        });
      })
      .catch(() => {
        // 무시 — 공유 시 폴백(새 탭)로 처리
      });
    return () => {
      alive = false;
    };
  }, [current.downloadUrl, current.name]);

  // 양옆 사진 미리 로드 — 넘길 때 바로 뜨게
  useEffect(() => {
    [items[index - 1], items[index + 1]].forEach((it) => {
      if (!it) return;
      const img = new Image();
      img.src = it.viewUrl;
    });
  }, [index, items]);

  // Esc 닫기 + ←/→ 넘기기 + 배경 스크롤 잠금
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, items.length]);

  // 터치 스와이프: 가로 이동 50px 이상 + 가로가 세로보다 클 때만 넘김
  const onTouchStart = (e: React.TouchEvent) => {
    const t0 = e.touches[0];
    touchStartRef.current = { x: t0.clientX, y: t0.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t0 = e.changedTouches[0];
    const dx = t0.clientX - start.x;
    const dy = t0.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) goNext();
    else goPrev();
  };

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
        await nav.share({ files: [shareFile], title: current.name });
      } catch {
        // 사용자가 취소했거나 실패 — 조용히 무시
      }
      return;
    }
    // 폴백: 새 탭으로 다운로드 (앱은 유지)
    window.open(current.downloadUrl, "_blank", "noopener,noreferrer");
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
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="dialog"
      aria-modal="true"
    >
      {/* 상단 바 — 위치 카운터 + 닫기 X */}
      <div className="flex items-center justify-between p-3 shrink-0">
        <div className="w-10" aria-hidden />
        <span className="text-white/80 text-sm font-medium tabular-nums">
          {items.length > 1 ? `${index + 1} / ${items.length}` : ""}
        </span>
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
      <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-auto px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.viewUrl}
          alt={current.name}
          onClick={(e) => e.stopPropagation()}
          className="max-w-full max-h-full object-contain select-none"
          draggable={false}
        />
        {/* 좌우 화살표 — 데스크톱용 (모바일은 스와이프) */}
        {hasPrev && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            aria-label={t("chat.imgPrev")}
            className="absolute left-2 top-1/2 -translate-y-1/2 hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white text-xl hover:bg-white/25"
          >
            ‹
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            aria-label={t("chat.imgNext")}
            className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white text-xl hover:bg-white/25"
          >
            ›
          </button>
        )}
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

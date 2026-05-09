"use client";

/**
 * 인앱 배지 동기화:
 *  - 브라우저 탭 title에 (N) 표시
 *  - favicon에 빨간 카운트 dot (canvas로 동적 생성)
 *  - 30초 폴링으로 SSR 카운트가 stale해지지 않도록
 *  - PWA 설치 시 navigator.setAppBadge로 OS 레벨 카운트
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const ORIGINAL_TITLE = "FPCTalk";
let cachedFaviconHref: string | null = null;

async function getOriginalFavicon(): Promise<string> {
  if (cachedFaviconHref) return cachedFaviconHref;
  const link = document.querySelector<HTMLLinkElement>(
    'link[rel~="icon"]:not([data-dynamic])',
  );
  cachedFaviconHref = link?.href || "/favicon.ico";
  return cachedFaviconHref;
}

async function updateFavicon(count: number) {
  if (typeof document === "undefined") return;

  const orig = await getOriginalFavicon();

  // count === 0: 원본 favicon으로 복원
  if (count <= 0) {
    const links = document.querySelectorAll<HTMLLinkElement>(
      'link[rel~="icon"][data-dynamic]',
    );
    links.forEach((l) => l.remove());
    return;
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 원본 favicon 위에 빨간 dot
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = orig;
    });
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, 0, 0, 64, 64);
    } else {
      // 이미지 로드 실패해도 빨간 점은 그려야 인지 가능
      ctx.fillStyle = "#0F4D3A";
      ctx.fillRect(0, 0, 64, 64);
    }

    // 빨간 동그라미
    ctx.beginPath();
    ctx.arc(48, 16, 16, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444";
    ctx.fill();

    // 숫자
    ctx.fillStyle = "white";
    const label = count > 99 ? "99+" : String(count);
    ctx.font = `bold ${label.length >= 3 ? 14 : 18}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 48, 17);

    const dataUrl = canvas.toDataURL("image/png");

    // 기존 dynamic link 제거 후 재등록
    document
      .querySelectorAll<HTMLLinkElement>('link[rel~="icon"][data-dynamic]')
      .forEach((l) => l.remove());
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = dataUrl;
    link.type = "image/png";
    link.setAttribute("data-dynamic", "true");
    document.head.appendChild(link);
  } catch {
    // ignore favicon update failures
  }
}

function setTabTitle(count: number) {
  if (typeof document === "undefined") return;
  document.title = count > 0 ? `(${count > 99 ? "99+" : count}) ${ORIGINAL_TITLE}` : ORIGINAL_TITLE;
}

async function setAppBadge(count: number) {
  if (typeof navigator === "undefined") return;
  type NavWithBadge = Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  const nav = navigator as NavWithBadge;
  try {
    if (count > 0 && nav.setAppBadge) {
      await nav.setAppBadge(count);
    } else if (nav.clearAppBadge) {
      await nav.clearAppBadge();
    }
  } catch {
    // unsupported / permission denied — silent
  }
}

export function BadgeSync({
  chatUnread,
  pendingSigns,
}: {
  chatUnread: number;
  pendingSigns: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [counts, setCounts] = useState({ chat: chatUnread, signs: pendingSigns });
  const lastSeenRef = useRef({ chat: chatUnread, signs: pendingSigns });

  // SSR로 받은 props가 갱신되면 state 동기화
  useEffect(() => {
    setCounts({ chat: chatUnread, signs: pendingSigns });
    lastSeenRef.current = { chat: chatUnread, signs: pendingSigns };
  }, [chatUnread, pendingSigns]);

  // 30초마다 서버 fetch — 다른 사람 메시지 도착 / 사인 요청 변동 catch-up
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/badges", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (
          typeof data.chat === "number" &&
          typeof data.signs === "number"
        ) {
          setCounts({ chat: data.chat, signs: data.signs });
        }
      } catch {
        // ignore
      }
    };
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // 채팅방 진입 시 해당 방의 unread는 markAsRead로 이미 클리어되므로
  // pathname 변경 시 한번 refresh 해서 최신 카운트 반영
  useEffect(() => {
    if (pathname.startsWith("/chat/") && pathname !== "/chat") {
      const t = setTimeout(() => router.refresh(), 1500);
      return () => clearTimeout(t);
    }
  }, [pathname, router]);

  // 카운트 변할 때마다 title/favicon/appBadge 갱신
  useEffect(() => {
    const total = counts.chat + counts.signs;
    setTabTitle(total);
    void updateFavicon(total);
    void setAppBadge(total);
  }, [counts.chat, counts.signs]);

  // 페이지 unmount 시 정리
  useEffect(() => {
    return () => {
      setTabTitle(0);
    };
  }, []);

  return null;
}

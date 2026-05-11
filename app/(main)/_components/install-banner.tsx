"use client";

/**
 * 진입 시 자동으로 뜨는 "홈 화면에 추가" 배너.
 *
 * 표시 조건:
 *  - 이미 standalone(설치된 PWA)으로 실행 중이 아님
 *  - 7일 이내에 dismiss한 적 없음
 *  - /install 페이지에서는 표시 안 함 (그 페이지가 자체 설치 UI를 가짐)
 *
 * 플랫폼 분기:
 *  - Android/Chrome/Edge: beforeinstallprompt → "설치" 버튼 1탭으로 OS 다이얼로그
 *  - iOS Safari: 공유 → "홈 화면에 추가" 가이드 모달
 *  - 그 외: /install로 가는 안내 (배너 자체는 안 표시)
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";

const DISMISS_KEY = "fpctalk:installBanner:dismissedAt";
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24시간

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Mode = "hidden" | "androidReady" | "ios";

/**
 * dismiss 여부 체크 — localStorage/sessionStorage 양쪽 + 24h 내인지.
 * 둘 다 실패해도 무해 (false 반환).
 */
function isRecentlyDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ls = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
    if (ls && Date.now() - ls < DISMISS_DURATION_MS) return true;
  } catch {
    // ignore
  }
  try {
    const ss = parseInt(sessionStorage.getItem(DISMISS_KEY) || "0", 10);
    if (ss && Date.now() - ss < DISMISS_DURATION_MS) return true;
  } catch {
    // ignore
  }
  return false;
}

export function InstallBanner() {
  const pathname = usePathname();
  const t = useT();
  const [mode, setMode] = useState<Mode>("hidden");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosModal, setShowIosModal] = useState(false);

  /**
   * 같은 페이지 세션에서 dismiss됐는지 in-memory ref로 즉시 추적.
   * useEffect cleanup 전에 beforeinstallprompt가 재발생해도 ref가 차단.
   * localStorage가 차단된 환경(시크릿/iframe)에서도 같은 탭이면 안전.
   */
  const dismissedRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // /install에선 표시 안 함
    if (pathname === "/install") return;

    // 이미 설치된 standalone 모드 → 표시 안 함
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    // dismiss 됐는지 (ref + storage 양쪽)
    if (dismissedRef.current || isRecentlyDismissed()) {
      dismissedRef.current = true;
      return;
    }

    // iOS Safari? — Chrome on iOS 등은 제외
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isInAppBrowser = /CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua);
    const isIosSafari = isIos && !isInAppBrowser;

    if (isIosSafari) {
      setMode("ios");
      return;
    }

    // Android/Desktop: beforeinstallprompt 대기
    // 핸들러 시점에 한 번 더 체크 — dismiss 후 SPA 페이지 이동으로
    // effect 재실행 전 사이에 브라우저가 이벤트를 재발화해도 차단.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      if (dismissedRef.current || isRecentlyDismissed()) {
        dismissedRef.current = true;
        return;
      }
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("androidReady");
    };
    const onInstalled = () => {
      setMode("hidden");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [pathname]);

  const dismiss = () => {
    // ref 즉시 — 다음 effect/이벤트가 동기 발생해도 차단
    dismissedRef.current = true;
    const ts = String(Date.now());
    try {
      localStorage.setItem(DISMISS_KEY, ts);
    } catch {
      // ignore
    }
    try {
      // localStorage 차단(시크릿/iframe) 환경 보호용 백업
      sessionStorage.setItem(DISMISS_KEY, ts);
    } catch {
      // ignore
    }
    setMode("hidden");
    setDeferred(null);
    setShowIosModal(false);
  };

  const installAndroid = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setMode("hidden");
      } else {
        // dismiss로 처리
        dismiss();
      }
    } catch {
      // ignore
    }
    setDeferred(null);
  };

  if (mode === "hidden") return null;

  return (
    <>
      {/* mobile: bottom (모바일 nav 위), desktop: bottom-right toast */}
      <div className="fixed left-3 right-3 bottom-[64px] md:left-auto md:right-4 md:bottom-4 md:max-w-sm z-40">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-3 flex items-center gap-3">
          <img
            src="/icons/icon-192.png"
            alt=""
            className="w-12 h-12 rounded-lg shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-50 truncate">
              {t("install.banner.title")}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
              {t("install.banner.body")}
            </div>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            {mode === "androidReady" ? (
              <button
                type="button"
                onClick={installAndroid}
                className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1.5 whitespace-nowrap"
              >
                {t("install.banner.install")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowIosModal(true)}
                className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1.5 whitespace-nowrap"
              >
                {t("install.banner.add")}
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 whitespace-nowrap"
            >
              {t("install.banner.later")}
            </button>
          </div>
        </div>
      </div>

      {showIosModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-3"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowIosModal(false);
          }}
        >
          <div className="bg-white dark:bg-zinc-950 rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <h3 className="font-semibold text-lg text-zinc-900 dark:text-zinc-50">
              {t("install.ios.title")}
            </h3>
            <ol className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300 list-decimal pl-5">
              <li>{t("install.ios.step1")}</li>
              <li>{t("install.ios.step2")}</li>
              <li>{t("install.ios.step3")}</li>
              <li>{t("install.ios.step4")}</li>
            </ol>

            <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 p-2 text-[11px] text-amber-800 dark:text-amber-200">
              {t("install.ios.tip")}
            </div>

            <div className="flex gap-2 pt-1">
              <Link
                href="/install"
                onClick={() => setShowIosModal(false)}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 text-sm px-3 py-2 flex-1 text-center hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                {t("install.banner.details")}
              </Link>
              <button
                type="button"
                onClick={() => {
                  // 모달만 닫고 배너는 그대로 유지 — 다시 시도 가능
                  setShowIosModal(false);
                }}
                className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium px-3 py-2 flex-1"
              >
                {t("install.ios.gotIt")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

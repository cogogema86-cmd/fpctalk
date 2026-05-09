"use client";

/**
 * iPhone Safari 사용자에게 항상 표시되는 가이드 카드.
 * standalone(설치된 앱)에선 표시 안 함.
 */

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

export function IosGuide() {
  const t = useT();
  const [show, setShow] = useState(false);
  const [inAppBrowser, setInAppBrowser] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 이미 standalone (설치된 앱) → 표시 안 함
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isInAppBrowser = /CriOS|FxiOS|OPiOS|EdgiOS|KAKAOTALK|NAVER|Instagram|FBAN|FBAV/i.test(ua);

    if (isIos) {
      setShow(true);
      setInAppBrowser(isInAppBrowser);
    }
  }, []);

  if (!show) return null;

  return (
    <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-4 space-y-3">
      <div className="font-semibold text-sm text-blue-900 dark:text-blue-100">
        {t("install.ios.title")}
      </div>

      {inAppBrowser && (
        <div className="rounded-md bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 p-2 text-xs text-amber-900 dark:text-amber-200">
          ⚠️ {t("install.ios.openInSafari")} — {t("install.ios.tip")}
        </div>
      )}

      <ol className="space-y-1.5 text-sm text-blue-900 dark:text-blue-100 list-decimal pl-5">
        <li>{t("install.ios.step1")}</li>
        <li>{t("install.ios.step2")}</li>
        <li>{t("install.ios.step3")}</li>
        <li>{t("install.ios.step4")}</li>
      </ol>

      <div className="text-[11px] text-blue-800 dark:text-blue-200 leading-relaxed">
        {t("install.ios.tip")}
      </div>
    </div>
  );
}

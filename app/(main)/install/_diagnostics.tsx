"use client";

/**
 * 설치 / 알림이 안 될 때 사용자가 직접 진단할 수 있는 상태 패널.
 * 보안 정보(키 자체)는 표시하지 않음 — 존재 여부만 표시.
 */

import { useEffect, useState } from "react";

type Diag = {
  ua: string;
  https: boolean;
  serviceWorkerSupported: boolean;
  swRegistered: boolean;
  swActive: boolean;
  pushSupported: boolean;
  pushSubscribed: boolean;
  notificationApi: boolean;
  notifPermission: NotificationPermission | "unsupported";
  setAppBadgeSupported: boolean;
  installable: boolean; // beforeinstallprompt 잡혔는지
  standalone: boolean;
  vapidConfigured: boolean;
};

export function Diagnostics() {
  const [d, setD] = useState<Diag | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const collect = async () => {
      const ua = navigator.userAgent;
      const swSup = "serviceWorker" in navigator;
      let swReg = false;
      let swActive = false;
      let pushSub = false;
      if (swSup) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          swReg = regs.length > 0;
          const reg = await navigator.serviceWorker.getRegistration("/");
          swActive = !!reg?.active;
          if (reg) {
            const sub = await reg.pushManager.getSubscription().catch(() => null);
            pushSub = !!sub;
          }
        } catch {
          // ignore
        }
      }

      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;

      // beforeinstallprompt가 잡혔는지 — 이 컴포넌트에서 직접 잡진 않지만
      // 페이지 다른 곳에서 잡았을 때 window 플래그로 공유 (간이)
      const installable = (window as Window & { __fpcInstallable?: boolean })
        .__fpcInstallable === true;

      setD({
        ua,
        https: window.location.protocol === "https:",
        serviceWorkerSupported: swSup,
        swRegistered: swReg,
        swActive,
        pushSupported: "PushManager" in window,
        pushSubscribed: pushSub,
        notificationApi: typeof Notification !== "undefined",
        notifPermission:
          typeof Notification !== "undefined"
            ? Notification.permission
            : "unsupported",
        setAppBadgeSupported: "setAppBadge" in navigator,
        installable,
        standalone,
        vapidConfigured: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });
    };
    void collect();
    const id = setInterval(collect, 2000);
    return () => clearInterval(id);
  }, []);

  if (!d) {
    return (
      <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 text-xs text-zinc-500">
        진단 정보 수집 중...
      </div>
    );
  }

  const isIos = /iphone|ipad|ipod/i.test(d.ua);
  const iosNeedsInstall = isIos && !d.standalone;

  return (
    <>
      {iosNeedsInstall && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3 text-sm text-amber-900 dark:text-amber-100 mb-2">
          <div className="font-semibold">⚠️ iOS는 PWA 설치 후에만 푸시 알림 동작</div>
          <div className="text-xs mt-1">
            아래 진단의 빨간 항목들(PushManager / Notification / 알림 권한 / setAppBadge)은
            현재 일반 Safari 탭이라서 표시되는 것입니다. <strong>홈 화면에 추가 → 그 아이콘으로 실행</strong>하시면 모두 🟢 supported로 바뀌고 알림 허용 버튼도 동작합니다.
          </div>
        </div>
      )}
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900"
    >
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
        <span>🔍 시스템 진단</span>
        <span className="text-[11px] text-zinc-500">
          {open ? "접기" : "펼치기 — 설치/알림이 안 될 때"}
        </span>
      </summary>
      <div className="px-3 pb-3 space-y-1.5 text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
        <Row ok={d.https} label="HTTPS">
          {d.https ? "yes" : "no — Push/PWA 동작 안 함"}
        </Row>
        <Row ok={d.serviceWorkerSupported} label="serviceWorker API">
          {d.serviceWorkerSupported ? "supported" : "unsupported (Firefox iOS 등)"}
        </Row>
        <Row ok={d.swRegistered} label="SW 등록됨">
          {d.swRegistered ? "yes" : "no — 페이지 새로고침 후 다시 확인"}
        </Row>
        <Row ok={d.swActive} label="SW active">
          {d.swActive ? "active" : "not active — 새로고침 필요"}
        </Row>
        <Row
          ok={d.pushSupported}
          warn={iosNeedsInstall && !d.pushSupported}
          label="PushManager API"
        >
          {d.pushSupported
            ? "supported"
            : iosNeedsInstall
              ? "iOS standalone 모드에서만 (홈 화면 추가 후 그 아이콘으로 실행해야 활성화)"
              : "unsupported"}
        </Row>
        <Row
          ok={d.notificationApi}
          warn={iosNeedsInstall && !d.notificationApi}
          label="Notification API"
        >
          {d.notificationApi
            ? "supported"
            : iosNeedsInstall
              ? "iOS standalone 모드에서만"
              : "unsupported"}
        </Row>
        <Row
          ok={d.notifPermission === "granted"}
          warn={d.notifPermission === "denied" || iosNeedsInstall}
          label="알림 권한"
        >
          {iosNeedsInstall && d.notifPermission === "unsupported"
            ? "iOS standalone에서만 요청 가능"
            : d.notifPermission}
        </Row>
        <Row
          ok={d.pushSubscribed}
          warn={iosNeedsInstall}
          label="푸시 구독"
        >
          {d.pushSubscribed
            ? "subscribed"
            : iosNeedsInstall
              ? "PWA 설치 후 가능"
              : "not subscribed"}
        </Row>
        <Row ok={d.vapidConfigured} label="VAPID 공개키 (env)">
          {d.vapidConfigured
            ? "configured"
            : "❌ 미설정 — Vercel Environment Variables에 NEXT_PUBLIC_VAPID_PUBLIC_KEY 등록 필요"}
        </Row>
        <Row
          ok={d.setAppBadgeSupported}
          warn={iosNeedsInstall && !d.setAppBadgeSupported}
          label="setAppBadge API"
        >
          {d.setAppBadgeSupported
            ? "supported"
            : iosNeedsInstall
              ? "iOS standalone에서만"
              : "unsupported (Firefox 등)"}
        </Row>
        <Row
          ok={d.installable || isIos}
          warn={isIos}
          label="설치 가능 (beforeinstallprompt)"
        >
          {d.standalone
            ? "이미 설치됨"
            : isIos
              ? "iOS는 영구히 미지원 — Safari 공유 → 홈 화면에 추가로 진행 (정상)"
              : d.installable
                ? "yes — 1탭 설치 가능"
                : "no — 이미 설치/거부됐거나 PWA 조건 미충족 (수동 설치 필요)"}
        </Row>
        <Row ok={d.standalone} label="standalone 모드">
          {d.standalone ? "yes (PWA로 실행 중)" : "no (브라우저에서 실행 중)"}
        </Row>
        <div className="pt-2 text-[10px] text-zinc-500 break-all">
          UA: {d.ua}
        </div>
      </div>
    </details>
    </>
  );
}

function Row({
  ok,
  warn,
  label,
  children,
}: {
  ok?: boolean;
  warn?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const dot = warn ? "🟡" : ok ? "🟢" : "🔴";
  return (
    <div className="flex gap-2">
      <span>{dot}</span>
      <span className="text-zinc-700 dark:text-zinc-300 font-semibold min-w-[10rem]">
        {label}
      </span>
      <span className="break-all flex-1">{children}</span>
    </div>
  );
}

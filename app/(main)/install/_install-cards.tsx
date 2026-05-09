"use client";

/**
 * 3개 OS 카드 (iOS / Android / Windows-macOS) — 사용자 OS를 자동 감지해
 * 추천 카드를 강조. 각 카드는 자체적으로 상태 관리:
 *   - 이미 설치된 PWA인지 (display-mode: standalone)
 *   - beforeinstallprompt deferred 이벤트 보유 여부
 *   - 알림 권한 상태 (Notification.permission)
 *
 * 클릭 시:
 *   - Android/Windows: deferred.prompt() 1탭 설치
 *   - iOS: 공유→홈 화면에 추가 안내 (자동 실행 불가)
 *   - 알림: Notification.requestPermission + push subscribe
 */

import { useEffect, useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";
import {
  subscribePushAction,
  unsubscribePushAction,
} from "@/app/_actions/push";

type Os = "ios" | "android" | "desktop" | "unknown";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function detectOs(): Os {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  // Windows, Mac, Linux 모두 desktop으로
  if (/Windows|Macintosh|Mac OS X|Linux/i.test(ua)) return "desktop";
  return "unknown";
}

function detectInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /CriOS|FxiOS|OPiOS|EdgiOS|KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line/i.test(
    navigator.userAgent,
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function InstallCards() {
  const t = useT();
  const [os, setOs] = useState<Os>("unknown");
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [inAppBrowser, setInAppBrowser] = useState(false);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">(
    "default",
  );
  const [pushSubscribed, setPushSubscribed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOs(detectOs());
    setInAppBrowser(detectInAppBrowser());

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    if (typeof Notification === "undefined") {
      setNotifPerm("unsupported");
    } else {
      setNotifPerm(Notification.permission);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setIsStandalone(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // 푸시 구독 상태 확인
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setPushSubscribed(!!sub))
        .catch(() => {});
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
        {t("install.cards.title")}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <IosCard
          recommended={os === "ios"}
          isStandalone={isStandalone && os === "ios"}
          inAppBrowser={inAppBrowser}
          notifPerm={notifPerm}
          pushSubscribed={pushSubscribed}
          setPushSubscribed={setPushSubscribed}
          setNotifPerm={setNotifPerm}
        />
        <AndroidCard
          recommended={os === "android"}
          isStandalone={isStandalone && os === "android"}
          deferred={deferred}
          setDeferred={setDeferred}
          notifPerm={notifPerm}
          pushSubscribed={pushSubscribed}
          setPushSubscribed={setPushSubscribed}
          setNotifPerm={setNotifPerm}
        />
        <DesktopCard
          recommended={os === "desktop"}
          isStandalone={isStandalone && os === "desktop"}
          deferred={deferred}
          setDeferred={setDeferred}
          notifPerm={notifPerm}
          pushSubscribed={pushSubscribed}
          setPushSubscribed={setPushSubscribed}
          setNotifPerm={setNotifPerm}
        />
      </div>

      <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-200">
        {t("install.cards.badgeNote")}
      </div>
    </div>
  );
}

// =====================================================
// 공통: 알림 토글
// =====================================================
async function enableNotifications(opts: {
  setNotifPerm: (p: NotificationPermission) => void;
  setPushSubscribed: (b: boolean) => void;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const perm = await Notification.requestPermission();
    opts.setNotifPerm(perm);
    if (perm !== "granted") return { ok: false };

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      return { ok: false, error: "VAPID 공개키가 설정되지 않았습니다." };
    }
    const reg = await navigator.serviceWorker.ready;
    const keyBytes = urlBase64ToUint8Array(vapidKey);
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes.buffer.slice(
        keyBytes.byteOffset,
        keyBytes.byteOffset + keyBytes.byteLength,
      ) as ArrayBuffer,
    });
    const json = sub.toJSON();
    await subscribePushAction({
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      userAgent: navigator.userAgent,
    });
    opts.setPushSubscribed(true);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "알림 설정 실패" };
  }
}

async function disableNotifications(opts: {
  setPushSubscribed: (b: boolean) => void;
}): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      await unsubscribePushAction(sub.endpoint);
    }
    opts.setPushSubscribed(false);
  } catch {
    // ignore
  }
}

// =====================================================
// 공통: 카드 컨테이너
// =====================================================
function CardShell({
  recommended,
  children,
}: {
  recommended: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div
      className={`rounded-xl border p-4 flex flex-col gap-3 ${
        recommended
          ? "border-emerald-400 dark:border-emerald-700 ring-2 ring-emerald-300/40 bg-emerald-50/40 dark:bg-emerald-950/20"
          : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
      }`}
    >
      {recommended && (
        <div className="text-[10px] font-semibold tracking-wider uppercase text-emerald-700 dark:text-emerald-300">
          {t("install.cards.recommended")}
        </div>
      )}
      {children}
    </div>
  );
}

function StatusRow({
  isStandalone,
  notifPerm,
  pushSubscribed,
}: {
  isStandalone: boolean;
  notifPerm: NotificationPermission | "unsupported";
  pushSubscribed: boolean;
}) {
  const t = useT();
  return (
    <div className="text-[11px] flex flex-wrap gap-1.5">
      {isStandalone && (
        <span className="rounded bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300 px-1.5 py-0.5">
          {t("install.cards.installed")}
        </span>
      )}
      {notifPerm === "granted" && pushSubscribed && (
        <span className="rounded bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300 px-1.5 py-0.5">
          {t("install.cards.notifGranted")}
        </span>
      )}
      {notifPerm === "denied" && (
        <span className="rounded bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300 px-1.5 py-0.5">
          {t("install.cards.notifDenied")}
        </span>
      )}
      {notifPerm === "default" && !isStandalone && (
        <span className="rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5">
          {t("install.cards.notifDefault")}
        </span>
      )}
    </div>
  );
}

// =====================================================
// iOS 카드
// =====================================================
function IosCard(props: {
  recommended: boolean;
  isStandalone: boolean;
  inAppBrowser: boolean;
  notifPerm: NotificationPermission | "unsupported";
  pushSubscribed: boolean;
  setPushSubscribed: (b: boolean) => void;
  setNotifPerm: (p: NotificationPermission) => void;
}) {
  const t = useT();
  const [isPending, startTransition] = useTransition();

  const onEnableNotif = () =>
    startTransition(async () => {
      await enableNotifications({
        setNotifPerm: props.setNotifPerm,
        setPushSubscribed: props.setPushSubscribed,
      });
    });

  return (
    <CardShell recommended={props.recommended}>
      <div>
        <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-50">
          {t("install.cards.iosTitle")}
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">
          {t("install.cards.iosWhy")}
        </div>
      </div>

      <StatusRow
        isStandalone={props.isStandalone}
        notifPerm={props.notifPerm}
        pushSubscribed={props.pushSubscribed}
      />

      {props.recommended && props.inAppBrowser && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 p-2 text-[11px] text-amber-800 dark:text-amber-200">
          {t("install.cards.iosWarn")}
        </div>
      )}

      {!props.isStandalone && (
        <ol className="text-xs text-zinc-700 dark:text-zinc-300 space-y-1 list-decimal pl-5">
          <li>{t("install.cards.iosStep1")}</li>
          <li>{t("install.cards.iosStep2")}</li>
          <li>{t("install.cards.iosStep3")}</li>
          <li>{t("install.cards.iosStep4")}</li>
        </ol>
      )}

      {props.isStandalone &&
        props.notifPerm !== "denied" &&
        !props.pushSubscribed && (
          <button
            type="button"
            onClick={onEnableNotif}
            disabled={isPending}
            className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-2 disabled:opacity-50"
          >
            {isPending
              ? t("install.cards.notifEnabling")
              : t("install.cards.notifEnable")}
          </button>
        )}

      {props.notifPerm === "denied" && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/40 p-2 text-[11px] text-red-800 dark:text-red-200">
          {t("install.cards.iosNotifDenied")}
        </div>
      )}

      {!props.isStandalone && props.recommended && (
        <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 p-2 text-[11px] text-zinc-600 dark:text-zinc-400">
          <div className="font-medium mb-0.5">
            {t("install.cards.iosShare")}
          </div>
          {t("install.cards.iosShareBody")}
        </div>
      )}

      {!props.isStandalone && (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {t("install.cards.iosNotifTip")}
        </div>
      )}
    </CardShell>
  );
}

// =====================================================
// Android 카드
// =====================================================
function AndroidCard(props: {
  recommended: boolean;
  isStandalone: boolean;
  deferred: BeforeInstallPromptEvent | null;
  setDeferred: (e: BeforeInstallPromptEvent | null) => void;
  notifPerm: NotificationPermission | "unsupported";
  pushSubscribed: boolean;
  setPushSubscribed: (b: boolean) => void;
  setNotifPerm: (p: NotificationPermission) => void;
}) {
  const t = useT();
  const [isPending, startTransition] = useTransition();

  const onInstall = () => {
    if (!props.deferred) return;
    startTransition(async () => {
      try {
        await props.deferred!.prompt();
        await props.deferred!.userChoice;
      } catch {
        // ignore
      }
      props.setDeferred(null);
    });
  };

  const onEnableNotif = () =>
    startTransition(async () => {
      await enableNotifications({
        setNotifPerm: props.setNotifPerm,
        setPushSubscribed: props.setPushSubscribed,
      });
    });

  return (
    <CardShell recommended={props.recommended}>
      <div>
        <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-50">
          {t("install.cards.androidTitle")}
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">
          {t("install.cards.androidWhy")}
        </div>
      </div>

      <StatusRow
        isStandalone={props.isStandalone}
        notifPerm={props.notifPerm}
        pushSubscribed={props.pushSubscribed}
      />

      {!props.isStandalone && props.deferred ? (
        <button
          type="button"
          onClick={onInstall}
          disabled={isPending}
          className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-2 disabled:opacity-50"
        >
          {isPending
            ? t("install.cards.androidInstalling")
            : t("install.cards.androidInstall")}
        </button>
      ) : !props.isStandalone ? (
        <ol className="text-xs text-zinc-700 dark:text-zinc-300 space-y-1 list-decimal pl-5">
          <li>{t("install.cards.androidManual1")}</li>
          <li>{t("install.cards.androidManual2")}</li>
          <li>{t("install.cards.androidManual3")}</li>
        </ol>
      ) : null}

      {!props.isStandalone && !props.deferred && (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {t("install.cards.androidManualHint")}
        </div>
      )}

      {props.notifPerm !== "denied" && !props.pushSubscribed && (
        <button
          type="button"
          onClick={onEnableNotif}
          disabled={isPending}
          className="rounded-md border border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-sm font-medium px-3 py-2 disabled:opacity-50"
        >
          {isPending
            ? t("install.cards.notifEnabling")
            : t("install.cards.notifEnable")}
        </button>
      )}

      {props.notifPerm === "denied" && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 p-2 text-[11px] text-amber-800 dark:text-amber-200">
          🚫 알림이 차단됨 — 주소창 자물쇠 → 사이트 설정 → 알림 허용으로 변경
        </div>
      )}
    </CardShell>
  );
}

// =====================================================
// Desktop (Windows/macOS) 카드
// =====================================================
function DesktopCard(props: {
  recommended: boolean;
  isStandalone: boolean;
  deferred: BeforeInstallPromptEvent | null;
  setDeferred: (e: BeforeInstallPromptEvent | null) => void;
  notifPerm: NotificationPermission | "unsupported";
  pushSubscribed: boolean;
  setPushSubscribed: (b: boolean) => void;
  setNotifPerm: (p: NotificationPermission) => void;
}) {
  const t = useT();
  const [isPending, startTransition] = useTransition();

  const onInstall = () => {
    if (!props.deferred) return;
    startTransition(async () => {
      try {
        await props.deferred!.prompt();
        await props.deferred!.userChoice;
      } catch {
        // ignore
      }
      props.setDeferred(null);
    });
  };

  const onEnableNotif = () =>
    startTransition(async () => {
      await enableNotifications({
        setNotifPerm: props.setNotifPerm,
        setPushSubscribed: props.setPushSubscribed,
      });
    });

  return (
    <CardShell recommended={props.recommended}>
      <div>
        <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-50">
          {t("install.cards.desktopTitle")}
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">
          {t("install.cards.desktopWhy")}
        </div>
      </div>

      <StatusRow
        isStandalone={props.isStandalone}
        notifPerm={props.notifPerm}
        pushSubscribed={props.pushSubscribed}
      />

      {!props.isStandalone && props.deferred ? (
        <button
          type="button"
          onClick={onInstall}
          disabled={isPending}
          className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-2 disabled:opacity-50"
        >
          {isPending
            ? t("install.cards.androidInstalling")
            : t("install.cards.desktopInstall")}
        </button>
      ) : !props.isStandalone ? (
        <ul className="text-xs text-zinc-700 dark:text-zinc-300 space-y-1 list-disc pl-5">
          <li>{t("install.cards.desktopManual1")}</li>
          <li>{t("install.cards.desktopManual2")}</li>
          <li className="text-zinc-500">
            {t("install.cards.desktopManual3")}
          </li>
        </ul>
      ) : null}

      {props.notifPerm !== "denied" && !props.pushSubscribed && (
        <button
          type="button"
          onClick={onEnableNotif}
          disabled={isPending}
          className="rounded-md border border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-sm font-medium px-3 py-2 disabled:opacity-50"
        >
          {isPending
            ? t("install.cards.notifEnabling")
            : t("install.cards.notifEnable")}
        </button>
      )}
    </CardShell>
  );
}

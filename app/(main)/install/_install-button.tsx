"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Mode = "loading" | "ready" | "installed" | "ios" | "manual";

export function InstallButton() {
  const [mode, setMode] = useState<Mode>("loading");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 이미 standalone (홈 화면 추가 + 실행)이면 installed 처리
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari 의 standalone 플래그
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) {
      setMode("installed");
      return;
    }

    const ua = navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    if (isIos) {
      setMode("ios");
    } else {
      setMode("manual");
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("ready");
    };

    window.addEventListener("beforeinstallprompt", onPrompt);

    const onInstalled = () => setMode("installed");
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (mode === "loading") {
    return null;
  }

  if (mode === "installed") {
    return (
      <div className="rounded-md bg-green-50 dark:bg-green-950/40 p-3 text-sm text-green-800 dark:text-green-200">
        ✅ 이미 홈 화면에 설치된 앱에서 실행 중입니다.
      </div>
    );
  }

  if (mode === "ready" && deferred) {
    return (
      <button
        type="button"
        onClick={async () => {
          await deferred.prompt();
          const choice = await deferred.userChoice;
          if (choice.outcome === "accepted") setMode("installed");
          setDeferred(null);
        }}
        className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
      >
        📲 홈 화면에 설치
      </button>
    );
  }

  if (mode === "ios") {
    return (
      <div className="rounded-md bg-blue-50 dark:bg-blue-950/40 p-4 text-sm text-blue-900 dark:text-blue-100 space-y-2">
        <div className="font-semibold">📱 iPhone / iPad</div>
        <ol className="space-y-1 list-decimal pl-5 text-xs">
          <li>아래쪽 공유 버튼{" "}
            <span className="inline-block px-1.5 py-0.5 rounded bg-white dark:bg-zinc-900 border">
              ⬆️
            </span>
            을 누릅니다.
          </li>
          <li>"홈 화면에 추가" 항목을 선택합니다.</li>
          <li>이름을 확인 후 "추가"를 누르면 홈 화면에 FPCTalk 아이콘이 생깁니다.</li>
          <li>이후엔 카카오톡처럼 아이콘을 눌러 바로 채팅으로 진입합니다.</li>
        </ol>
        <div className="text-[11px] text-blue-700 dark:text-blue-300 mt-2">
          ⚠️ 푸시 알림 + 앱 아이콘 배지는 iOS 16.4 이상 + 설치 후에만 동작합니다.
        </div>
      </div>
    );
  }

  // manual (Android/desktop이지만 beforeinstallprompt 이벤트가 안 온 케이스)
  return (
    <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 p-4 text-sm space-y-2">
      <div className="font-semibold">📱 Android (Chrome) / 데스크톱</div>
      <ol className="space-y-1 list-decimal pl-5 text-xs text-zinc-700 dark:text-zinc-300">
        <li>주소창 우측의 "앱 설치" 또는 ⋮ 메뉴 → "앱 설치 / 홈 화면에 추가"를 누릅니다.</li>
        <li>"설치"를 확인하면 홈 화면 / 앱 서랍에 FPCTalk 아이콘이 생깁니다.</li>
        <li>아이콘을 눌러 바로 채팅으로 진입할 수 있습니다.</li>
      </ol>
      <div className="text-[11px] text-zinc-500">
        ※ 이미 한 번 설치 안내를 닫았거나 시크릿 모드일 경우 1-탭 버튼이 안 보일 수 있습니다.
      </div>
    </div>
  );
}

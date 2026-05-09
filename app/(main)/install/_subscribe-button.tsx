"use client";

import { useEffect, useState, useTransition } from "react";
import {
  subscribePushAction,
  unsubscribePushAction,
} from "@/app/_actions/push";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToB64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type State =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "denied" }
  | { kind: "off" }
  | { kind: "on" }
  | { kind: "error"; msg: string };

export function SubscribeButton() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const init = async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState({ kind: "unsupported" });
        return;
      }
      if (Notification.permission === "denied") {
        setState({ kind: "denied" });
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setState({ kind: sub ? "on" : "off" });
      } catch {
        setState({ kind: "off" });
      }
    };
    void init();
  }, []);

  const enable = () =>
    startTransition(async () => {
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setState({ kind: "denied" });
          return;
        }

        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) {
          setState({ kind: "error", msg: "VAPID 공개키가 설정되지 않았습니다." });
          return;
        }

        const reg = await navigator.serviceWorker.ready;
        // BufferSource expected — wrap Uint8Array's underlying ArrayBuffer
        const keyBytes = urlBase64ToUint8Array(vapidKey);
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes.buffer.slice(
            keyBytes.byteOffset,
            keyBytes.byteOffset + keyBytes.byteLength,
          ) as ArrayBuffer,
        });

        const json = sub.toJSON();
        const result = await subscribePushAction({
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          userAgent: navigator.userAgent,
        });
        if (!result.ok) {
          setState({ kind: "error", msg: result.error ?? "구독 실패" });
          return;
        }
        setState({ kind: "on" });
      } catch (e) {
        setState({
          kind: "error",
          msg: e instanceof Error ? e.message : "알림 설정 실패",
        });
      }
    });

  const disable = () =>
    startTransition(async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await unsubscribePushAction(sub.endpoint);
        }
        setState({ kind: "off" });
      } catch (e) {
        setState({
          kind: "error",
          msg: e instanceof Error ? e.message : "해제 실패",
        });
      }
    });

  if (state.kind === "loading") {
    return (
      <div className="text-sm text-zinc-500">알림 상태 확인 중...</div>
    );
  }
  if (state.kind === "unsupported") {
    return (
      <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 p-3 text-sm text-zinc-600 dark:text-zinc-400">
        이 브라우저는 푸시 알림을 지원하지 않습니다. <br />
        <span className="text-xs text-zinc-500">
          iPhone은 Safari에서 "홈 화면에 추가" 후 사용해야 알림을 받을 수 있습니다 (iOS 16.4+).
        </span>
      </div>
    );
  }
  if (state.kind === "denied") {
    return (
      <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-200">
        알림이 차단되어 있습니다. 브라우저 주소창의 자물쇠 아이콘 → 사이트 설정 → 알림을 "허용"으로 변경해주세요.
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
        {state.msg}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {state.kind === "on" ? (
        <>
          <div className="rounded-md bg-green-50 dark:bg-green-950/40 p-3 text-sm text-green-800 dark:text-green-200">
            ✅ 이 기기에서 알림이 켜져 있습니다.
          </div>
          <button
            type="button"
            onClick={disable}
            disabled={isPending}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50 self-start"
          >
            {isPending ? "처리 중..." : "🔕 알림 끄기"}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={enable}
          disabled={isPending}
          className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 self-start"
        >
          {isPending ? "처리 중..." : "🔔 이 기기에서 알림 받기"}
        </button>
      )}
    </div>
  );
}

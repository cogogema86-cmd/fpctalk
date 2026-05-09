/* eslint-disable no-restricted-globals */
/**
 * FPCTalk service worker
 *
 * 책임:
 *  - install/activate (캐시 없음 — 항상 네트워크)
 *  - push 이벤트 수신 → 시스템 알림 표시 + setAppBadge
 *  - notificationclick → /chat 또는 지정된 url로 이동
 *
 * 캐싱은 Next.js 자체 캐시 + Vercel CDN에 위임. SW는 푸시/배지 책임만.
 */

self.addEventListener("install", () => {
  // 즉시 활성화 (다음 페이지 로드부터 새 SW 적용)
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // 즉시 모든 클라이언트 control
  event.waitUntil(self.clients.claim());
});

/**
 * fetch 이벤트 핸들러는 비어 있어도 반드시 등록되어야 함.
 * Chrome/Edge의 PWA installability 체크가 sw에 fetch 핸들러 존재 여부를 봄.
 * (없으면 beforeinstallprompt 이벤트가 발생하지 않음 → "지금 설치" 버튼이 안 뜸)
 */
self.addEventListener("fetch", () => {
  // pass-through: 캐싱 없음, 브라우저 기본 동작에 위임
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "FPCTalk", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "FPCTalk";
  const body = data.body || "";
  const url = data.url || "/chat";
  const tag = data.tag || "fpctalk-default";
  const badgeCount = typeof data.badgeCount === "number" ? data.badgeCount : null;

  const options = {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag,
    renotify: true,
    data: { url },
    requireInteraction: false,
  };

  event.waitUntil(
    (async () => {
      // 1) OS 알림
      await self.registration.showNotification(title, options);
      // 2) 홈 화면 아이콘 배지 갱신
      try {
        if (badgeCount !== null && "setAppBadge" in self.navigator) {
          if (badgeCount > 0) {
            await self.navigator.setAppBadge(badgeCount);
          } else if ("clearAppBadge" in self.navigator) {
            await self.navigator.clearAppBadge();
          }
        }
      } catch {
        // ignore
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/chat";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // 이미 열린 창 있으면 focus + 해당 url로 이동
      for (const c of all) {
        if ("focus" in c) {
          try {
            await c.navigate(targetUrl);
          } catch {
            // navigate 실패해도 focus는 시도
          }
          return c.focus();
        }
      }
      // 없으면 새 창
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

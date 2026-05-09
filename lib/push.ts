/**
 * Web Push 발송 헬퍼.
 * VAPID 키는 .env / Vercel 환경변수에 등록되어 있어야 함:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 */
import webpush from "web-push";
import { prisma } from "@/lib/db";

let configured = false;
function configureWebPush() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || "mailto:admin@fpctalk.com";
  if (!pub || !priv) {
    throw new Error("VAPID keys missing — push 발송 불가");
  }
  webpush.setVapidDetails(subj, pub, priv);
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  badgeCount?: number;
};

/** 한 명에게 푸시 발송 (구독한 모든 디바이스에) */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; pruned: number }> {
  try {
    configureWebPush();
  } catch {
    return { sent: 0, pruned: 0 };
  }

  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
  });
  if (subs.length === 0) return { sent: 0, pruned: 0 };

  // unread/사인 카운트로 badgeCount 자동 추가 (호출자가 명시 안 했을 때)
  let resolvedBadge = payload.badgeCount;
  if (resolvedBadge === undefined) {
    const [chat, signs] = await Promise.all([
      // 채팅 unread는 동적이라 비싼 계산 — 여기선 생략하고 수신쪽에서 폴링/SSR이 갱신
      Promise.resolve(0),
      prisma.signatureRequest.count({
        where: { signerId: userId, status: "PENDING" },
      }),
    ]);
    resolvedBadge = chat + signs;
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/chat",
    tag: payload.tag ?? "fpctalk-default",
    badgeCount: resolvedBadge,
  });

  let sent = 0;
  let pruned = 0;
  const stale: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          body,
          { TTL: 60 * 60 * 24 }, // 24h
        );
        sent += 1;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          stale.push(s.endpoint);
        }
      }
    }),
  );

  if (stale.length > 0) {
    await prisma.pushSubscription
      .deleteMany({ where: { endpoint: { in: stale } } })
      .then((r) => {
        pruned = r.count;
      })
      .catch(() => {});
  }

  // 갱신된 subs는 lastUsed 업데이트
  await prisma.pushSubscription
    .updateMany({
      where: { userId, endpoint: { notIn: stale } },
      data: { lastUsed: new Date() },
    })
    .catch(() => {});

  return { sent, pruned };
}

/** 여러 명에게 동시 발송 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; pruned: number }> {
  const results = await Promise.all(
    userIds.map((uid) => sendPushToUser(uid, payload)),
  );
  return results.reduce(
    (acc, r) => ({ sent: acc.sent + r.sent, pruned: acc.pruned + r.pruned }),
    { sent: 0, pruned: 0 },
  );
}

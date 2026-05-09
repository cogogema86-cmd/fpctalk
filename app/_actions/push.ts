"use server";

import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";

export type PushSubscribeInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
};

export async function subscribePushAction(
  input: PushSubscribeInput,
): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  if (!input.endpoint || !input.p256dh || !input.auth) {
    return { ok: false, error: "구독 정보가 잘못되었습니다." };
  }

  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      update: {
        userId: me.id,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
        lastUsed: new Date(),
      },
      create: {
        userId: me.id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
      },
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "구독 실패",
    };
  }
}

export async function unsubscribePushAction(
  endpoint: string,
): Promise<{ ok: boolean }> {
  const me = await getMe();
  if (!me) return { ok: false };
  await prisma.pushSubscription
    .deleteMany({ where: { endpoint, userId: me.id } })
    .catch(() => {});
  return { ok: true };
}

/** 본인 구독 상태 조회 (UI 표시용) */
export async function listMyPushSubscriptionsAction(): Promise<{
  subscriptions: Array<{ endpoint: string; userAgent: string | null; createdAt: string }>;
}> {
  const me = await getMe();
  if (!me) return { subscriptions: [] };
  const list = await prisma.pushSubscription.findMany({
    where: { userId: me.id },
    select: { endpoint: true, userAgent: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return {
    subscriptions: list.map((s) => ({
      endpoint: s.endpoint,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
    })),
  };
}

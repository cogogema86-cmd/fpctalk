/**
 * 학원 행사 (Event) 헬퍼.
 * - 다가오는 행사 (D-7 이내)
 * - 본인 ack 여부
 * - 관리자에게 미확인 행사 카운트
 */

import { prisma } from "@/lib/db";

export type UpcomingEvent = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  location: string | null;
  daysFromNow: number;
  acked: boolean;
};

export async function getUpcomingEventsForUser(
  userId: string,
  days = 7,
): Promise<UpcomingEvent[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const events = await prisma.event.findMany({
    where: {
      // 시작일이 D-7 이내
      startDate: { lte: horizon },
      // 끝나지 않음 (오늘 이후)
      endDate: { gte: now },
    },
    orderBy: { startDate: "asc" },
    include: {
      acknowledgements: {
        where: { userId },
        select: { id: true },
      },
    },
  });

  return events.map((e) => {
    const startMs = e.startDate.getTime();
    const days = Math.max(
      0,
      Math.ceil((startMs - now.getTime()) / (24 * 60 * 60 * 1000)),
    );
    return {
      id: e.id,
      title: e.title,
      startDate: e.startDate.toISOString(),
      endDate: e.endDate.toISOString(),
      location: e.location,
      daysFromNow: days,
      acked: e.acknowledgements.length > 0,
    };
  });
}

/** 관리자용 — 본인이 ack 안 한 다가오는 행사 수 */
export async function countUnackedUpcomingEventsForUser(
  userId: string,
  days = 7,
): Promise<number> {
  const events = await getUpcomingEventsForUser(userId, days);
  return events.filter((e) => !e.acked).length;
}

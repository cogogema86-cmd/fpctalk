/**
 * 개인 일정 (PersonalEvent) 헬퍼
 *
 * - 본인만 보는 비공개 일정
 * - 학원 행사(Event)와 구분
 * - AI 비서가 컨텍스트로 사용할 때 **본인 컨텍스트로만** — 그룹 채팅에서는 노출 X
 */

import { prisma } from "@/lib/db";

export type PersonalEventListItem = {
  id: string;
  title: string;
  startAt: string; // ISO
  endAt: string | null;
  allDay: boolean;
  note: string | null;
};

/**
 * 특정 월에 본인 일정. (해당 월 범위와 시간이 겹치는 것)
 * 캘린더 셀에 그릴 때 사용.
 */
export async function getMonthlyPersonalEvents(
  userId: string,
  year: number,
  monthIdx: number,
): Promise<PersonalEventListItem[]> {
  const monthStart = new Date(year, monthIdx, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, monthIdx + 1, 0, 23, 59, 59, 999);

  const events = await prisma.personalEvent.findMany({
    where: {
      userId,
      OR: [
        // 시작이 그 달 안
        { startAt: { gte: monthStart, lte: monthEnd } },
        // 종료가 그 달 안
        { endAt: { gte: monthStart, lte: monthEnd } },
        // 시작 ≤ 월시작 & (종료 ≥ 월말 OR 종료 null && 시작 ≤ 월시작)
        {
          startAt: { lte: monthStart },
          endAt: { gte: monthEnd },
        },
      ],
    },
    orderBy: { startAt: "asc" },
  });

  return events.map((e) => ({
    id: e.id,
    title: e.title,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt ? e.endAt.toISOString() : null,
    allDay: e.allDay,
    note: e.note,
  }));
}

/** 다가오는 내 일정 (오늘 이후 N일 이내, 시간 오름차순) */
export async function getUpcomingPersonalEvents(
  userId: string,
  days = 7,
): Promise<PersonalEventListItem[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const events = await prisma.personalEvent.findMany({
    where: {
      userId,
      startAt: { gte: now, lte: horizon },
    },
    orderBy: { startAt: "asc" },
    take: 50,
  });

  return events.map((e) => ({
    id: e.id,
    title: e.title,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt ? e.endAt.toISOString() : null,
    allDay: e.allDay,
    note: e.note,
  }));
}

/** AI 비서 system prompt에 박을 텍스트 (개인 일정 컨텍스트). */
export async function getPersonalEventsForAiContext(
  userId: string,
): Promise<string> {
  const now = new Date();
  // 어제부터 향후 30일 — 최근 끝난 것과 다가오는 일정 모두 인지
  const past = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const events = await prisma.personalEvent.findMany({
    where: {
      userId,
      startAt: { gte: past, lte: future },
    },
    orderBy: { startAt: "asc" },
    take: 100,
  });
  if (events.length === 0) return "";

  return events
    .map((e) => {
      const dateStr = e.startAt.toISOString().slice(0, 10);
      const timeStr = e.allDay
        ? "(종일)"
        : `${e.startAt.toISOString().slice(11, 16)}${
            e.endAt ? "–" + e.endAt.toISOString().slice(11, 16) : ""
          }`;
      const noteStr = e.note ? ` — ${e.note}` : "";
      return `${dateStr} ${timeStr} ${e.title}${noteStr}`;
    })
    .join("\n");
}

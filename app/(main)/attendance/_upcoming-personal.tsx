"use client";

/**
 * 다가오는 내 일정 카드
 *
 * - 캘린더 상단 / 대시보드에서 사용
 * - D-7 이내의 본인 personal events
 * - 비어 있어도 표시되도록 카드 자체는 항상 그림 (비어있다 → 안내 문구)
 * - 클릭 시 /attendance 로 이동 (해당 날짜로 jump하진 않음 — 단순)
 */

import Link from "next/link";
import { useT, useLocale } from "@/lib/i18n/client";
import type { PersonalEventListItem } from "./_personal-event-modal";

export function UpcomingPersonal({
  events,
}: {
  events: PersonalEventListItem[];
}) {
  const t = useT();
  const locale = useLocale();

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const tomorrowD = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrow = `${tomorrowD.getFullYear()}-${String(tomorrowD.getMonth() + 1).padStart(2, "0")}-${String(tomorrowD.getDate()).padStart(2, "0")}`;

  const formatDay = (iso: string) => {
    const dateStr = iso.slice(0, 10);
    if (dateStr === today) return t("att.personal.today");
    if (dateStr === tomorrow) return t("att.personal.tomorrow");
    // D-N 계산
    const target = new Date(`${dateStr}T00:00:00`);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round(
      (target.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays > 0) {
      return `${t("att.personal.dDay")}${diffDays}`;
    }
    return dateStr;
  };

  const formatTime = (ev: PersonalEventListItem) => {
    if (ev.allDay) return t("att.personal.allDay");
    return `${ev.startAt.slice(11, 16)}${ev.endAt ? "–" + ev.endAt.slice(11, 16) : ""}`;
  };

  const formatDateLine = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(locale === "en" ? "en-US" : "ko-KR", {
      month: "short",
      day: "numeric",
      weekday: "short",
    });
  };

  return (
    <section className="rounded-lg border border-purple-200 dark:border-purple-900 bg-purple-50/40 dark:bg-purple-950/20 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm text-purple-900 dark:text-purple-100">
          📌 {t("att.personal.upcoming")}
        </h2>
        <Link
          href="/attendance"
          className="text-xs text-purple-700 dark:text-purple-300 hover:underline"
        >
          {t("dashboard.viewAll")}
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {t("att.personal.upcomingEmpty")}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {events.slice(0, 5).map((ev) => (
            <li
              key={ev.id}
              className="rounded-md bg-white dark:bg-zinc-950 border border-purple-100 dark:border-purple-900/60 px-3 py-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {ev.title}
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {formatDateLine(ev.startAt)} · {formatTime(ev)}
                  </div>
                </div>
                <span className="shrink-0 rounded bg-purple-500 text-white text-[10px] font-semibold px-1.5 py-0.5">
                  {formatDay(ev.startAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

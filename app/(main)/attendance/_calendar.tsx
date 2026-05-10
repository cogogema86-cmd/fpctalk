/**
 * 휴가·행사 캘린더
 *
 * 셀별로:
 *   - 본인 휴가: 진한 색
 *   - 동료 휴가: 흐린 색 (관리자 보기에서)
 *   - 행사 (Stage B에서 추가)
 */

import { CalendarNav } from "./_calendar-nav";

type LeaveEntry = {
  id: string;
  name: string;
  type: string; // ANNUAL/HALF_AM/HALF_PM/SICK/OFFICIAL/OTHER
  isMine: boolean;
};

type EventEntry = {
  id: string;
  title: string;
};

const KOR_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const TYPE_BADGE: Record<string, string> = {
  ANNUAL: "연차",
  HALF_AM: "오전",
  HALF_PM: "오후",
  SICK: "병가",
  OFFICIAL: "공가",
  OTHER: "기타",
};

const TYPE_BADGE_EN: Record<string, string> = {
  ANNUAL: "Annual",
  HALF_AM: "AM",
  HALF_PM: "PM",
  SICK: "Sick",
  OFFICIAL: "Off.",
  OTHER: "Other",
};

export function MonthCalendar({
  year,
  monthIdx,
  leavesByDay,
  eventsByDay,
  locale = "ko",
}: {
  year: number;
  monthIdx: number;
  leavesByDay: Record<string, LeaveEntry[]>;
  eventsByDay?: Record<string, EventEntry[]>;
  locale?: "ko" | "en";
}) {
  const monthStart = new Date(year, monthIdx, 1);
  const monthEnd = new Date(year, monthIdx + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const startWeekday = monthStart.getDay();

  const cells: Array<{ day: number | null; key: string }> = [];
  for (let i = 0; i < startWeekday; i++)
    cells.push({ day: null, key: `empty-${i}` });
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, key });
  }
  while (cells.length < 42) cells.push({ day: null, key: `tail-${cells.length}` });

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === monthIdx;

  const weekdays = locale === "en"
    ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    : KOR_WEEKDAYS;

  const typeBadge = locale === "en" ? TYPE_BADGE_EN : TYPE_BADGE;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
      <CalendarNav year={year} monthIdx={monthIdx} locale={locale} />


      <div className="grid grid-cols-7 text-xs text-center border-b border-zinc-200 dark:border-zinc-800">
        {weekdays.map((w, i) => (
          <div
            key={w}
            className={`py-2 font-medium ${
              i === 0
                ? "text-red-500"
                : i === 6
                  ? "text-blue-500"
                  : "text-zinc-500"
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((c) => {
          if (c.day === null) {
            return (
              <div
                key={c.key}
                className="min-h-[5rem] border-t border-l border-zinc-100 dark:border-zinc-900 first:border-l-0"
              />
            );
          }
          const leaves = leavesByDay[c.key] ?? [];
          const events = eventsByDay?.[c.key] ?? [];
          const isToday = isCurrentMonth && c.day === today.getDate();
          const dayOfWeek = (startWeekday + c.day - 1) % 7;
          return (
            <div
              key={c.key}
              className={`min-h-[5rem] border-t border-l border-zinc-100 dark:border-zinc-900 first:border-l-0 p-1 text-xs ${
                isToday ? "bg-blue-50/40 dark:bg-blue-950/20" : ""
              }`}
            >
              <div
                className={`text-[11px] font-medium ${
                  dayOfWeek === 0
                    ? "text-red-500"
                    : dayOfWeek === 6
                      ? "text-blue-500"
                      : "text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {c.day}
              </div>

              <div className="mt-0.5 space-y-0.5">
                {events.slice(0, 2).map((ev) => (
                  <div
                    key={ev.id}
                    className="rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 px-1 py-0.5 text-[10px] truncate"
                    title={ev.title}
                  >
                    🎉 {ev.title}
                  </div>
                ))}
                {leaves.slice(0, 3 - Math.min(events.length, 2)).map((lv) => (
                  <div
                    key={lv.id}
                    className={`rounded px-1 py-0.5 text-[10px] truncate ${
                      lv.isMine
                        ? "bg-blue-500 text-white"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                    }`}
                    title={`${lv.name} · ${typeBadge[lv.type] ?? lv.type}`}
                  >
                    {lv.name} · {typeBadge[lv.type] ?? lv.type}
                  </div>
                ))}
                {leaves.length + events.length > 3 && (
                  <div className="text-[10px] text-zinc-400">
                    +{leaves.length + events.length - 3}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type DayEntry = {
  in: string | null;
  out: string | null;
};

const KOR_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function fmt(time: string | null): string {
  if (!time) return "";
  const t = new Date(time);
  return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}

export function MonthCalendar({
  year,
  monthIdx, // 0-11
  byDay, // { '2026-05-09': { in, out } }
}: {
  year: number;
  monthIdx: number;
  byDay: Record<string, DayEntry>;
}) {
  const monthStart = new Date(year, monthIdx, 1);
  const monthEnd = new Date(year, monthIdx + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const startWeekday = monthStart.getDay(); // 0=일

  // 캘린더 셀: 빈 칸 + 날짜들
  const cells: Array<{ day: number | null; key: string }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ day: null, key: `empty-${i}` });
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, key });
  }

  // 6주 그리드 채우기 (총 42 셀)
  while (cells.length < 42) cells.push({ day: null, key: `tail-${cells.length}` });

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === monthIdx;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="font-semibold">
          {year}년 {monthIdx + 1}월
        </h2>
      </div>

      <div className="grid grid-cols-7 text-xs text-center border-b border-zinc-200 dark:border-zinc-800">
        {KOR_WEEKDAYS.map((w, i) => (
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
            return <div key={c.key} className="aspect-square border-t border-l border-zinc-100 dark:border-zinc-900 first:border-l-0" />;
          }
          const entry = c.key in byDay ? byDay[c.key] : null;
          const isToday = isCurrentMonth && c.day === today.getDate();
          const dayOfWeek = (startWeekday + c.day - 1) % 7;
          return (
            <div
              key={c.key}
              className={`aspect-square border-t border-l border-zinc-100 dark:border-zinc-900 first:border-l-0 p-1 text-xs ${
                isToday ? "bg-blue-50 dark:bg-blue-950/30" : ""
              }`}
            >
              <div
                className={`font-medium ${
                  dayOfWeek === 0
                    ? "text-red-500"
                    : dayOfWeek === 6
                      ? "text-blue-500"
                      : "text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {c.day}
              </div>
              {entry && (
                <div className="mt-0.5 space-y-0.5 text-[10px]">
                  {entry.in && (
                    <div className="text-blue-600 dark:text-blue-400 truncate">
                      ↑ {fmt(entry.in)}
                    </div>
                  )}
                  {entry.out && (
                    <div className="text-orange-600 dark:text-orange-400 truncate">
                      ↓ {fmt(entry.out)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

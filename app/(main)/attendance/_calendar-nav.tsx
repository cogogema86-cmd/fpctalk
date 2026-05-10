"use client";

import { useRouter } from "next/navigation";

export function CalendarNav({
  year,
  monthIdx,
  locale,
}: {
  year: number;
  monthIdx: number;
  locale: "ko" | "en";
}) {
  const router = useRouter();

  const ym = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
  const prev = (() => {
    const d = new Date(year, monthIdx - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const next = (() => {
    const d = new Date(year, monthIdx + 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  const monthLabel =
    locale === "en"
      ? `${
          [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
          ][monthIdx]
        } ${year}`
      : `${year}년 ${monthIdx + 1}월`;

  const today = new Date();
  const isCurrent =
    today.getFullYear() === year && today.getMonth() === monthIdx;

  return (
    <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => router.push(`?ym=${prev}`)}
        aria-label="Previous month"
        className="rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 px-3 py-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 text-lg font-medium"
      >
        ‹
      </button>

      <div className="flex items-center gap-2 flex-wrap justify-center">
        <h2 className="font-semibold text-base">{monthLabel}</h2>
        {/* native month picker — 클릭 시 달력에서 년·월 직접 선택 */}
        <input
          type="month"
          value={ym}
          onChange={(e) => {
            const v = e.target.value;
            if (v && /^\d{4}-\d{2}$/.test(v)) {
              router.push(`?ym=${v}`);
            }
          }}
          aria-label="Select year and month"
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
        />
        {!isCurrent && (
          <button
            type="button"
            onClick={() => router.push("/attendance")}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {locale === "en" ? "Today" : "오늘"}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => router.push(`?ym=${next}`)}
        aria-label="Next month"
        className="rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 px-3 py-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 text-lg font-medium"
      >
        ›
      </button>
    </div>
  );
}

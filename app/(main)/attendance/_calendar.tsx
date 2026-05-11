"use client";

/**
 * 휴가·행사 캘린더
 *
 * 셀별로:
 *   - 본인 휴가: 진한 파란색
 *   - 동료 휴가: 흐린 회색 (관리자 보기에서)
 *   - 학원 행사: amber
 *
 * 카테고리별 체크박스로 끄기/켜기 가능 — localStorage에 영속화.
 */

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";
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

const STORAGE_KEY = "fpctalk:calendar:visible";

type Visibility = { mine: boolean; others: boolean; event: boolean };
const DEFAULT_VISIBILITY: Visibility = { mine: true, others: true, event: true };

function readVisibility(): Visibility {
  if (typeof window === "undefined") return DEFAULT_VISIBILITY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBILITY;
    const parsed = JSON.parse(raw) as Partial<Visibility>;
    return {
      mine: parsed.mine ?? true,
      others: parsed.others ?? true,
      event: parsed.event ?? true,
    };
  } catch {
    return DEFAULT_VISIBILITY;
  }
}

export function MonthCalendar({
  year,
  monthIdx,
  leavesByDay,
  eventsByDay,
  locale = "ko",
  showOthersToggle = false,
}: {
  year: number;
  monthIdx: number;
  leavesByDay: Record<string, LeaveEntry[]>;
  eventsByDay?: Record<string, EventEntry[]>;
  locale?: "ko" | "en";
  /** 관리자 보기에서만 "동료 휴가" 토글 표시 */
  showOthersToggle?: boolean;
}) {
  const t = useT();
  const [visible, setVisible] = useState<Visibility>(DEFAULT_VISIBILITY);
  const [hydrated, setHydrated] = useState(false);

  // 첫 마운트 시 localStorage 읽기 (SSR/hydration mismatch 방지)
  useEffect(() => {
    setVisible(readVisibility());
    setHydrated(true);
  }, []);

  const toggle = (key: keyof Visibility) => {
    setVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const monthStart = useMemo(() => new Date(year, monthIdx, 1), [year, monthIdx]);
  const daysInMonth = useMemo(
    () => new Date(year, monthIdx + 1, 0).getDate(),
    [year, monthIdx],
  );
  const startWeekday = monthStart.getDay();

  const cells: Array<{ day: number | null; key: string }> = [];
  for (let i = 0; i < startWeekday; i++)
    cells.push({ day: null, key: `empty-${i}` });
  for (let d = 1; d <= daysInMonth; d++) {
    const k = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, key: k });
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

      {/* 카테고리 토글 (범례 + 체크박스) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-xs border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40">
        <ToggleChip
          checked={visible.mine}
          onChange={() => toggle("mine")}
          color="bg-blue-500"
          label={t("att.calendarLegend.mine")}
          disabled={!hydrated}
        />
        {showOthersToggle && (
          <ToggleChip
            checked={visible.others}
            onChange={() => toggle("others")}
            color="bg-zinc-300 dark:bg-zinc-600"
            label={t("att.calendarLegend.others")}
            disabled={!hydrated}
          />
        )}
        <ToggleChip
          checked={visible.event}
          onChange={() => toggle("event")}
          color="bg-amber-300"
          label={t("att.calendarLegend.event")}
          disabled={!hydrated}
        />
        <span className="ml-auto text-[10px] text-zinc-400 dark:text-zinc-500 hidden sm:inline">
          {t("att.toggle.hint")}
        </span>
      </div>

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
          const allLeaves = leavesByDay[c.key] ?? [];
          // 토글 상태에 따라 필터
          const filteredLeaves = allLeaves.filter((lv) => {
            if (lv.isMine) return visible.mine;
            return visible.others;
          });
          const filteredEvents = visible.event ? (eventsByDay?.[c.key] ?? []) : [];

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
                {filteredEvents.slice(0, 2).map((ev) => (
                  <div
                    key={ev.id}
                    className="rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 px-1 py-0.5 text-[10px] truncate"
                    title={ev.title}
                  >
                    🎉 {ev.title}
                  </div>
                ))}
                {filteredLeaves
                  .slice(0, 3 - Math.min(filteredEvents.length, 2))
                  .map((lv) => (
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
                {filteredLeaves.length + filteredEvents.length > 3 && (
                  <div className="text-[10px] text-zinc-400">
                    +{filteredLeaves.length + filteredEvents.length - 3}
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

function ToggleChip({
  checked,
  onChange,
  color,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  color: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`inline-flex items-center gap-1.5 cursor-pointer select-none ${
        disabled ? "opacity-50" : ""
      } ${checked ? "" : "opacity-40"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="w-3.5 h-3.5 rounded border-zinc-300 dark:border-zinc-600 accent-emerald-600"
      />
      <span className={`inline-block w-3 h-3 rounded ${color}`} />
      <span className="text-zinc-600 dark:text-zinc-300">{label}</span>
    </label>
  );
}

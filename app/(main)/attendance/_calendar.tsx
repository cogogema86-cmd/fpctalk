"use client";

/**
 * 휴가·행사·내 일정 캘린더
 *
 * 셀별로:
 *   - 본인 휴가: 파랑
 *   - 동료 휴가: 회색 (관리자)
 *   - 학원 행사: amber
 *   - 내 일정(개인): 보라 — 본인만 보이는 비공개 일정
 *
 * 카테고리별 체크박스로 끄기/켜기 — localStorage 영속화.
 * 셀 클릭 시 그 날의 본인 일정 모달 오픈 (추가/편집/삭제).
 */

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { CalendarNav } from "./_calendar-nav";
import { PersonalEventModal, type PersonalEventListItem } from "./_personal-event-modal";

type LeaveEntry = {
  id: string;
  name: string;
  type: string;
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

type Visibility = {
  mine: boolean;
  others: boolean;
  event: boolean;
  personal: boolean;
};
const DEFAULT_VISIBILITY: Visibility = {
  mine: true,
  others: true,
  event: true,
  personal: true,
};

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
      personal: parsed.personal ?? true,
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
  personalEvents = [],
  locale = "ko",
  showOthersToggle = false,
}: {
  year: number;
  monthIdx: number;
  leavesByDay: Record<string, LeaveEntry[]>;
  eventsByDay?: Record<string, EventEntry[]>;
  /** 그 달의 본인 개인 일정 (서버에서 전달). */
  personalEvents?: PersonalEventListItem[];
  locale?: "ko" | "en";
  /** 관리자 보기에서만 "동료 휴가" 토글 표시 */
  showOthersToggle?: boolean;
}) {
  const t = useT();
  const [visible, setVisible] = useState<Visibility>(DEFAULT_VISIBILITY);
  const [hydrated, setHydrated] = useState(false);
  const [modalDate, setModalDate] = useState<string | null>(null);

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

  // 일자별 개인 일정 매핑
  const personalByDay = useMemo(() => {
    const map: Record<string, PersonalEventListItem[]> = {};
    for (const ev of personalEvents) {
      const key = ev.startAt.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [personalEvents]);

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
    <>
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
        <CalendarNav year={year} monthIdx={monthIdx} locale={locale} />

        {/* 카테고리 토글 */}
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
          <ToggleChip
            checked={visible.personal}
            onChange={() => toggle("personal")}
            color="bg-purple-500"
            label={t("att.calendarLegend.personal")}
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
            const filteredLeaves = allLeaves.filter((lv) => {
              if (lv.isMine) return visible.mine;
              return visible.others;
            });
            const filteredEvents = visible.event ? (eventsByDay?.[c.key] ?? []) : [];
            const filteredPersonal = visible.personal ? (personalByDay[c.key] ?? []) : [];

            const isToday = isCurrentMonth && c.day === today.getDate();
            const dayOfWeek = (startWeekday + c.day - 1) % 7;
            const totalCount =
              filteredLeaves.length + filteredEvents.length + filteredPersonal.length;
            // 셀에 최대 3개까지 표시. 우선순위: 행사 → 개인 일정 → 휴가
            const eventSlots = filteredEvents.slice(0, 2);
            const personalSlots = filteredPersonal.slice(
              0,
              Math.max(0, 3 - eventSlots.length),
            );
            const leaveSlots = filteredLeaves.slice(
              0,
              Math.max(0, 3 - eventSlots.length - personalSlots.length),
            );

            return (
              <button
                type="button"
                key={c.key}
                onClick={() => setModalDate(c.key)}
                className={`min-h-[5rem] border-t border-l border-zinc-100 dark:border-zinc-900 first:border-l-0 p-1 text-xs text-left hover:bg-purple-50/40 dark:hover:bg-purple-950/10 transition-colors ${
                  isToday ? "bg-blue-50/40 dark:bg-blue-950/20" : ""
                }`}
                title="클릭하여 내 일정 추가/조회"
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
                  {eventSlots.map((ev) => (
                    <div
                      key={`e-${ev.id}`}
                      className="rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 px-1 py-0.5 text-[10px] truncate"
                      title={ev.title}
                    >
                      🎉 {ev.title}
                    </div>
                  ))}
                  {personalSlots.map((p) => (
                    <div
                      key={`p-${p.id}`}
                      className="rounded bg-purple-500 text-white px-1 py-0.5 text-[10px] truncate"
                      title={`${p.title}${p.note ? " — " + p.note : ""}`}
                    >
                      📌 {p.title}
                    </div>
                  ))}
                  {leaveSlots.map((lv) => (
                    <div
                      key={`l-${lv.id}`}
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
                  {totalCount > 3 && (
                    <div className="text-[10px] text-zinc-400">+{totalCount - 3}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {modalDate && (
        <PersonalEventModal
          date={modalDate}
          items={personalEvents}
          onClose={() => setModalDate(null)}
        />
      )}
    </>
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

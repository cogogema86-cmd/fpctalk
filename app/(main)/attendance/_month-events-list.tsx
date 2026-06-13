"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteEventAction,
  updateEventAction,
} from "@/app/(main)/events/actions";
import { deleteLeaveByAdminAction } from "./actions";
import { useT } from "@/lib/i18n/client";

type EventItem = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  location: string | null;
};

/** ISO 문자열 → datetime-local input 값 (YYYY-MM-DDTHH:mm, 현지시각) */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type LeaveItem = {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  isMine: boolean;
};

const TYPE_BADGE_KO: Record<string, string> = {
  ANNUAL: "연차",
  HALF_AM: "오전반차",
  HALF_PM: "오후반차",
  SICK: "병가",
  OFFICIAL: "공가",
  OTHER: "기타",
};
const TYPE_BADGE_EN: Record<string, string> = {
  ANNUAL: "Annual",
  HALF_AM: "Half AM",
  HALF_PM: "Half PM",
  SICK: "Sick",
  OFFICIAL: "Official",
  OTHER: "Other",
};

export function MonthEventsList({
  events,
  leaves,
  isAdmin,
  locale,
  defaultOpen = false,
}: {
  events: EventItem[];
  leaves: LeaveItem[];
  isAdmin: boolean;
  locale: "ko" | "en";
  defaultOpen?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<EventItem | null>(null);

  const total = events.length + leaves.length;
  if (total === 0) return null;

  const dateFmt = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });

  const fmtRange = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    if (s.toDateString() === e.toDateString()) return dateFmt.format(s);
    return `${dateFmt.format(s)} ~ ${dateFmt.format(e)}`;
  };

  const items = [
    ...events.map((e) => ({ kind: "event" as const, ...e })),
    ...leaves.map((l) => ({ kind: "leave" as const, ...l })),
  ].sort((a, b) => a.startDate.localeCompare(b.startDate));

  const typeBadge = locale === "en" ? TYPE_BADGE_EN : TYPE_BADGE_KO;

  const handleDelete = (id: string, title: string) => {
    if (
      !confirm(
        locale === "en"
          ? `Delete event "${title}"?\nThis cannot be undone.`
          : `"${title}" 행사를 삭제하시겠습니까?\n복구할 수 없습니다.`,
      )
    ) {
      return;
    }
    setPendingId(id);
    startTransition(async () => {
      const r = await deleteEventAction(id);
      setPendingId(null);
      if (!r.ok) {
        alert(r.error ?? "삭제 실패");
        return;
      }
      router.refresh();
    });
  };

  const handleDeleteLeave = (id: string, name: string, typeLabel: string) => {
    if (
      !confirm(
        locale === "en"
          ? `Delete leave: ${name} · ${typeLabel}?\nIf approved, the staff's used leave count will be auto-corrected.`
          : `${name} · ${typeLabel} 휴가를 삭제하시겠습니까?\n승인된 휴가는 사용 일수가 자동으로 차감됩니다.`,
      )
    ) {
      return;
    }
    setPendingId(id);
    startTransition(async () => {
      const r = await deleteLeaveByAdminAction(id);
      setPendingId(null);
      if (!r.ok) {
        alert(r.error ?? "삭제 실패");
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
        aria-expanded={open}
      >
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
          📋 {t("att.monthEventsList")}{" "}
          <span className="text-sm text-zinc-500 font-normal">({total})</span>
        </h2>
        <span className="text-zinc-400 text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {editing && (
        <EventEditModal
          event={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      {open && (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 max-h-[60vh] overflow-y-auto">
          {items.map((it) => (
            <li
              key={`${it.kind}-${it.id}`}
              className="px-4 py-2.5 flex items-center gap-3 flex-wrap"
            >
              <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0 w-32 sm:w-40">
                {fmtRange(it.startDate, it.endDate)}
              </span>
              {it.kind === "event" ? (
                <>
                  <span className="text-amber-700 dark:text-amber-300 text-sm flex-1 min-w-0 truncate">
                    🎉 {it.title}
                    {it.location && (
                      <span className="text-zinc-500 ml-1.5 text-xs">
                        · 📍 {it.location}
                      </span>
                    )}
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({
                          id: it.id,
                          title: it.title,
                          startDate: it.startDate,
                          endDate: it.endDate,
                          location: it.location,
                        })
                      }
                      className="text-xs rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 shrink-0"
                    >
                      ✏️ 수정
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDelete(it.id, it.title)}
                      disabled={pendingId === it.id}
                      className="text-xs rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 shrink-0"
                    >
                      {pendingId === it.id
                        ? `${t("common.delete")}...`
                        : `🗑 ${t("common.delete")}`}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span
                    className={`text-sm flex-1 min-w-0 truncate ${
                      it.isMine
                        ? "text-blue-700 dark:text-blue-300 font-medium"
                        : "text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    🏖 {it.name}{" "}
                    <span className="text-xs text-zinc-500">
                      · {typeBadge[it.type] ?? it.type}
                    </span>
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteLeave(
                          it.id,
                          it.name,
                          typeBadge[it.type] ?? it.type,
                        )
                      }
                      disabled={pendingId === it.id}
                      className="text-xs rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 shrink-0"
                    >
                      {pendingId === it.id
                        ? `${t("common.delete")}...`
                        : `🗑 ${t("common.delete")}`}
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EventEditModal({
  event,
  onClose,
  onSaved,
}: {
  event: EventItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [start, setStart] = useState(toLocalInput(event.startDate));
  const [end, setEnd] = useState(toLocalInput(event.endDate));
  const [location, setLocation] = useState(event.location ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const save = () => {
    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await updateEventAction({
        eventId: event.id,
        title,
        // datetime-local 값(현지시각)을 ISO로 변환
        startDate: new Date(start).toISOString(),
        endDate: new Date(end).toISOString(),
        location: location.trim() || null,
      });
      if (!r.ok) {
        setError(r.error ?? "수정 실패");
        return;
      }
      onSaved();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
          🎉 행사 수정
        </h3>
        <div>
          <label className="text-xs text-zinc-500">제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-zinc-500">시작</label>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">종료</label>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-500">장소 (선택)</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
        {error && <div className="text-xs text-red-500">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            취소
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
          >
            {isPending ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

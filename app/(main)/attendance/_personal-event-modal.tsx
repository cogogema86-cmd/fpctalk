"use client";

/**
 * 개인 일정 모달
 *
 * - 캘린더 셀 클릭 시 열림
 * - 그 날짜의 본인 일정 목록 + 추가 폼
 * - 본인만 보는 비공개 일정
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import {
  addPersonalEventAction,
  deletePersonalEventAction,
  updatePersonalEventAction,
  type PersonalEventInput,
} from "./personal-actions";

export type PersonalEventListItem = {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  note: string | null;
};

type EditingState = null | { id: string | null; draft: PersonalEventInput };

export function PersonalEventModal({
  date, // "YYYY-MM-DD"
  items,
  onClose,
}: {
  date: string;
  items: PersonalEventListItem[];
  onClose: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [editing, setEditing] = useState<EditingState>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // 이 날짜에 해당하는 일정만 표시
  const dayItems = useMemo(() => {
    return items.filter((it) => it.startAt.slice(0, 10) === date);
  }, [items, date]);

  // ESC 키로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editing) setEditing(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, onClose]);

  const openNew = () => {
    setError(null);
    setEditing({
      id: null,
      draft: {
        title: "",
        date,
        allDay: false,
        startTime: "09:00",
        endTime: "10:00",
        note: "",
      },
    });
  };

  const openEdit = (it: PersonalEventListItem) => {
    setError(null);
    const startTime = it.allDay ? null : it.startAt.slice(11, 16);
    const endTime = it.allDay || !it.endAt ? null : it.endAt.slice(11, 16);
    setEditing({
      id: it.id,
      draft: {
        title: it.title,
        date,
        allDay: it.allDay,
        startTime,
        endTime,
        note: it.note ?? "",
      },
    });
  };

  const submit = () => {
    if (!editing) return;
    setError(null);
    startTransition(async () => {
      const r = editing.id
        ? await updatePersonalEventAction(editing.id, editing.draft)
        : await addPersonalEventAction(editing.draft);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm(t("att.personal.deleteConfirm"))) return;
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const r = await deletePersonalEventAction(id);
      setPendingId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-5 py-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            📌 {date}
            <span className="text-zinc-500 dark:text-zinc-400 text-xs ml-2">
              {t("att.personal.dayTitle")}
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-lg leading-none px-2 py-1"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          {!editing && (
            <>
              {dayItems.length === 0 ? (
                <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 p-4 text-center text-sm text-zinc-500">
                  {t("att.personal.empty")}
                </div>
              ) : (
                <ul className="space-y-2">
                  {dayItems.map((it) => (
                    <li
                      key={it.id}
                      className="rounded-md border border-purple-200 dark:border-purple-900 bg-purple-50/60 dark:bg-purple-950/30 p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-purple-900 dark:text-purple-100 truncate">
                            {it.title}
                          </div>
                          <div className="text-xs text-purple-700 dark:text-purple-300 mt-0.5">
                            {it.allDay
                              ? t("att.personal.allDay")
                              : `${it.startAt.slice(11, 16)}${
                                  it.endAt ? "–" + it.endAt.slice(11, 16) : ""
                                }`}
                          </div>
                          {it.note && (
                            <div className="text-xs text-zinc-600 dark:text-zinc-300 mt-1 whitespace-pre-wrap break-words">
                              {it.note}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 flex gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => openEdit(it)}
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {t("common.edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(it.id)}
                            disabled={pendingId === it.id}
                            className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                          >
                            {pendingId === it.id
                              ? t("att.personal.deleting")
                              : t("common.delete")}
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {error && (
                <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={openNew}
                className="w-full rounded-md bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2"
              >
                {t("att.personal.add")}
              </button>
            </>
          )}

          {editing && (
            <EditingForm
              editing={editing}
              setEditing={setEditing}
              onSubmit={submit}
              error={error}
              onCancel={() => setEditing(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EditingForm({
  editing,
  setEditing,
  onSubmit,
  error,
  onCancel,
}: {
  editing: NonNullable<EditingState>;
  setEditing: (s: EditingState) => void;
  onSubmit: () => void;
  error: string | null;
  onCancel: () => void;
}) {
  const t = useT();
  const { draft } = editing;
  const patch = (p: Partial<PersonalEventInput>) =>
    setEditing({ id: editing.id, draft: { ...draft, ...p } });

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
          {t("att.personal.titleLabel")}{" "}
          <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder={t("att.personal.titlePlaceholder")}
          autoFocus
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          maxLength={200}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.allDay}
          onChange={(e) => patch({ allDay: e.target.checked })}
        />
        <span>{t("att.personal.allDay")}</span>
      </label>

      {!draft.allDay && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              {t("att.personal.startTime")}
            </label>
            <input
              type="time"
              value={draft.startTime ?? ""}
              onChange={(e) => patch({ startTime: e.target.value })}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              {t("att.personal.endTime")}
            </label>
            <input
              type="time"
              value={draft.endTime ?? ""}
              onChange={(e) => patch({ endTime: e.target.value })}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
          {t("att.personal.noteLabel")}
        </label>
        <textarea
          value={draft.note ?? ""}
          onChange={(e) => patch({ note: e.target.value })}
          rows={2}
          placeholder={t("att.personal.notePlaceholder")}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          maxLength={1000}
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="rounded-md bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2"
        >
          {t("att.personal.save")}
        </button>
      </div>
    </div>
  );
}

"use client";

/**
 * 빠른 문구 (Quick Phrases) — 채팅 입력창 위 가로 스크롤 칩 줄.
 *
 * - localStorage(per-device)에 저장 — 디바이스마다 본인이 자주 쓰는 문구
 * - 가로 스크롤: 화면 너비에 자연 맞춤 (모바일 2~3개, PC 6~7개 자연 노출)
 * - 칩 탭/클릭 → onInsert(phrase) 호출 → 부모(ChatRoom)가 textarea에 삽입
 * - 우측 끝 ✏️ 버튼 → 관리 모달(추가/편집/삭제, 순서 위/아래)
 * - 처음 사용자에게 7개 기본 phrase 시드 (학원 운영 흔한 문구)
 */

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

const STORAGE_KEY = "fpctalk:quickPhrases:v1";
const SEED_KO = [
  "확인했습니다 👍",
  "감사합니다",
  "잠시만요",
  "수고하셨습니다",
  "오늘 결근입니다",
  "회의 중입니다",
  "이따 답변드릴게요",
];
const SEED_EN = [
  "Got it 👍",
  "Thanks",
  "One moment",
  "Good work",
  "Out today",
  "In a meeting",
  "Will reply later",
];

function readPhrases(locale: "ko" | "en"): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((p): p is string => typeof p === "string");
      }
    }
  } catch {
    // ignore
  }
  // 시드 (locale에 따라)
  return locale === "en" ? [...SEED_EN] : [...SEED_KO];
}

function writePhrases(phrases: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(phrases));
  } catch {
    // ignore
  }
}

export function QuickPhrases({
  onInsert,
  locale,
}: {
  onInsert: (phrase: string) => void;
  locale: "ko" | "en";
}) {
  const t = useT();
  const [phrases, setPhrases] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [showManager, setShowManager] = useState(false);

  // 첫 마운트 시 localStorage 읽기
  useEffect(() => {
    setPhrases(readPhrases(locale));
    setHydrated(true);
  }, [locale]);

  const persist = useCallback((next: string[]) => {
    setPhrases(next);
    writePhrases(next);
  }, []);

  if (!hydrated) {
    // SSR/hydration mismatch 방지: hydrate 전엔 자리만 잡고 비어있음
    return <div className="h-9" aria-hidden />;
  }

  return (
    <>
      <div className="flex items-center gap-1.5 -mx-1 px-1 mb-2">
        <div
          className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {phrases.length === 0 ? (
            <span className="text-[11px] text-zinc-400 px-1">
              {t("chat.quickPhrases.empty")}
            </span>
          ) : (
            phrases.map((p, i) => (
              <button
                key={`${p}-${i}`}
                type="button"
                onClick={() => onInsert(p)}
                title={t("chat.quickPhrases.insertTitle")}
                className="shrink-0 rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-xs px-3 py-1 whitespace-nowrap"
              >
                {p}
              </button>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowManager(true)}
          title={t("chat.quickPhrases.openManager")}
          className="shrink-0 rounded-full border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs w-7 h-7 flex items-center justify-center"
        >
          ✏️
        </button>
      </div>

      {showManager && (
        <PhrasesManager
          phrases={phrases}
          onChange={persist}
          onClose={() => setShowManager(false)}
        />
      )}
    </>
  );
}

function PhrasesManager({
  phrases,
  onChange,
  onClose,
}: {
  phrases: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");

  // ESC로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const addPhrase = () => {
    const v = draft.trim();
    if (!v) return;
    if (v.length > 200) return;
    if (phrases.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...phrases, v]);
    setDraft("");
  };

  const deletePhrase = (i: number) => {
    onChange(phrases.filter((_, idx) => idx !== i));
  };

  const startEdit = (i: number) => {
    setEditingIdx(i);
    setEditingValue(phrases[i]);
  };

  const saveEdit = () => {
    if (editingIdx === null) return;
    const v = editingValue.trim();
    if (!v) {
      setEditingIdx(null);
      return;
    }
    const next = [...phrases];
    next[editingIdx] = v.slice(0, 200);
    onChange(next);
    setEditingIdx(null);
    setEditingValue("");
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= phrases.length) return;
    const next = [...phrases];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-3"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-5 space-y-3 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">
            {t("chat.quickPhrases.manageTitle")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-lg leading-none px-2"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {t("chat.quickPhrases.manageHint")}
        </p>

        {/* 추가 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addPhrase();
              }
            }}
            placeholder={t("chat.quickPhrases.addPlaceholder")}
            maxLength={200}
            className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addPhrase}
            disabled={!draft.trim()}
            className="rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-2"
          >
            {t("chat.quickPhrases.add")}
          </button>
        </div>

        {/* 목록 */}
        {phrases.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 p-4 text-center text-sm text-zinc-500">
            {t("chat.quickPhrases.empty")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {phrases.map((p, i) => (
              <li
                key={`${p}-${i}`}
                className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2 flex items-center gap-2"
              >
                {editingIdx === i ? (
                  <>
                    <input
                      type="text"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveEdit();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setEditingIdx(null);
                        }
                      }}
                      autoFocus
                      maxLength={200}
                      className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="text-xs rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2 py-1"
                    >
                      {t("common.save")}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm truncate">{p}</span>
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      title="위로"
                      className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30 text-xs px-1"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === phrases.length - 1}
                      title="아래로"
                      className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30 text-xs px-1"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(i)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline px-1"
                    >
                      {t("common.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePhrase(i)}
                      className="text-xs text-red-600 dark:text-red-400 hover:underline px-1"
                    >
                      {t("common.delete")}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

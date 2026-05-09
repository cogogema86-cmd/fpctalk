"use client";

import { useActionState, useState, useMemo } from "react";
import Link from "next/link";
import {
  createGroupChatAction,
  type CreateGroupState,
} from "../../actions";
import { useT } from "@/lib/i18n/client";

const initialState: CreateGroupState = {};

type Candidate = {
  id: string;
  name: string;
  username: string;
  roleLabel: string;
  level: number;
};

export function GroupForm({
  candidates,
  isAdmin,
  myLevel,
  levelDistribution,
}: {
  candidates: Candidate[];
  isAdmin: boolean;
  myLevel: number;
  levelDistribution: Record<number, number>;
}) {
  const t = useT();
  const [state, formAction, isPending] = useActionState(
    createGroupChatAction,
    initialState,
  );
  const [mode, setMode] = useState<"members" | "level">("members");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [levelInput, setLevelInput] = useState("0");

  const filtered = candidates.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q) ||
      c.roleLabel.toLowerCase().includes(q)
    );
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 레벨 채팅 미리보기: 입력 레벨 이상 사용자 수 (본인 포함)
  const levelPreview = useMemo(() => {
    const lv = parseInt(levelInput, 10);
    if (!Number.isFinite(lv)) return null;
    let total = 0;
    for (const [k, v] of Object.entries(levelDistribution)) {
      if (parseInt(k, 10) >= lv) total += v;
    }
    return { level: lv, count: total };
  }, [levelInput, levelDistribution]);

  const submitDisabled = isPending || (mode === "members" && selected.size < 2);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="mode" value={mode} />

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          {t("chat.groupName")}
          <span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          name="name"
          type="text"
          required
          maxLength={50}
          disabled={isPending}
          placeholder={
            mode === "level"
              ? t("chat.groupNamePhLevel")
              : t("chat.groupNamePhMembers")
          }
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
        />
      </div>

      {/* 모드 토글 (관리자에게만 두 옵션 노출) */}
      {isAdmin && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-1 grid grid-cols-2 gap-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("members")}
            disabled={isPending}
            className={`rounded-md px-3 py-2 transition-colors ${
              mode === "members"
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            }`}
          >
            {t("chat.modeMembers")}
          </button>
          <button
            type="button"
            onClick={() => setMode("level")}
            disabled={isPending}
            className={`rounded-md px-3 py-2 transition-colors ${
              mode === "level"
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            }`}
          >
            {t("chat.modeLevel")}
          </button>
        </div>
      )}

      {/* === 모드 1: 직접 멤버 === */}
      {mode === "members" && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t("chat.selectMember")} ({selected.size + 1})
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t("chat.deselectAll")}
              </button>
            )}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("chat.searchPh")}
            disabled={isPending}
            className="w-full mb-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
          />
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 max-h-72 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900">
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-sm text-zinc-500 text-center">
                {candidates.length === 0
                  ? t("chat.noOtherStaff")
                  : t("chat.noSearchResult")}
              </div>
            )}
            {filtered.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <input
                  type="checkbox"
                  name="memberIds"
                  value={c.id}
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  disabled={isPending}
                />
                <div className="flex-1 text-sm">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-zinc-500">
                    {c.username} · {c.roleLabel} · {t("chat.levelLabel")}{" "}
                    {c.level}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {t("chat.minMembersHint")}
          </p>
        </div>
      )}

      {/* === 모드 2: 레벨 기반 === */}
      {mode === "level" && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {t("chat.requiredLevel")}
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              name="levelRequired"
              type="number"
              min={0}
              max={99}
              required
              value={levelInput}
              onChange={(e) => setLevelInput(e.target.value)}
              disabled={isPending}
              className="w-32 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-zinc-500">
              {t("chat.levelHint1")} <strong>{levelInput}</strong>{" "}
              {t("chat.levelHint2")}
            </p>
          </div>

          <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 p-3 text-sm">
            <div className="text-xs font-medium text-zinc-500 mb-2">
              {t("chat.levelDistTitle")}
            </div>
            <div className="space-y-1 text-xs">
              {Object.entries(levelDistribution)
                .map(([k, v]) => [parseInt(k, 10), v] as const)
                .sort((a, b) => b[0] - a[0])
                .map(([lv, count]) => (
                  <div
                    key={lv}
                    className="flex items-center justify-between"
                  >
                    <span>
                      {t("chat.levelLabel")} {lv}{" "}
                      <span className="text-zinc-400">({count})</span>
                    </span>
                    {levelPreview && lv >= levelPreview.level && (
                      <span className="text-green-600 dark:text-green-400">
                        {t("chat.levelIncluded")}
                      </span>
                    )}
                  </div>
                ))}
              {levelPreview && (
                <div className="border-t border-zinc-200 dark:border-zinc-800 mt-2 pt-2 font-medium">
                  {t("chat.levelVisibility")}{" "}
                  <span className="text-green-700 dark:text-green-300">
                    {levelPreview.count}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md bg-blue-50 dark:bg-blue-950/40 p-3 text-xs text-blue-800 dark:text-blue-200">
            {t("chat.myLevelHint1")} <strong>{myLevel}</strong>
            {t("chat.myLevelHint2")}
          </div>
        </div>
      )}

      {state.error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {state.error}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={submitDisabled}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
        >
          {isPending
            ? t("chat.creatingGroup")
            : mode === "level"
              ? `${t("chat.levelLabel")} ${levelInput}+ ${t("chat.createLevelChat")}`
              : t("chat.newGroupTitle")}
        </button>
        <Link
          href="/chat"
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm"
        >
          {t("common.cancel")}
        </Link>
      </div>
    </form>
  );
}

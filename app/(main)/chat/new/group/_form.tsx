"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  createGroupChatAction,
  type CreateGroupState,
} from "../../actions";

const initialState: CreateGroupState = {};

type Candidate = {
  id: string;
  name: string;
  username: string;
  roleLabel: string;
};

export function GroupForm({ candidates }: { candidates: Candidate[] }) {
  const [state, formAction, isPending] = useActionState(
    createGroupChatAction,
    initialState,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

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

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          그룹 이름
          <span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          name="name"
          type="text"
          required
          maxLength={50}
          disabled={isPending}
          placeholder="예: 강사진 단톡방, 운영팀 공지"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            멤버 (선택됨 {selected.size}명, 본인 포함 {selected.size + 1}명)
            <span className="text-red-500 ml-0.5">*</span>
          </label>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              전체 해제
            </button>
          )}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름/아이디/역할 검색"
          disabled={isPending}
          className="w-full mb-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
        />
        <div className="rounded-md border border-zinc-200 dark:border-zinc-800 max-h-72 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-sm text-zinc-500 text-center">
              {candidates.length === 0
                ? "다른 직원이 없습니다."
                : "검색 결과가 없습니다."}
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
                  {c.username} · {c.roleLabel}
                </div>
              </div>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          최소 본인 포함 3명 (즉, 다른 멤버 2명 이상) 필요
        </p>
      </div>

      {state.error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {state.error}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={isPending || selected.size < 2}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
        >
          {isPending ? "생성 중..." : "그룹 채팅 만들기"}
        </button>
        <Link
          href="/chat"
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm"
        >
          취소
        </Link>
      </div>
    </form>
  );
}

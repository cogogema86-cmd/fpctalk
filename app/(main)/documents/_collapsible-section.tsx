"use client";

import { Children, useState, type ReactNode } from "react";

/**
 * 문서 페이지 섹션 래퍼 — 접기(collapse) + 10개 단위 페이지네이션.
 *
 * 서버에서 렌더한 <li> 들을 children으로 받아, 클라이언트에서 현재 페이지(10개)만 표시한다.
 * 데이터(양식·캠페인 등)가 계속 쌓여도 화면이 길어지지 않게 하고, 제목을 눌러 접을 수 있다.
 */
export function CollapsibleSection({
  title,
  children,
  pageSize = 10,
  defaultOpen = false,
  listClassName = "",
}: {
  title: string;
  children: ReactNode;
  pageSize?: number;
  defaultOpen?: boolean;
  listClassName?: string;
}) {
  const items = Children.toArray(children);
  const [open, setOpen] = useState(defaultOpen);
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const start = current * pageSize;
  const visible = items.slice(start, start + pageSize);

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 group"
        aria-expanded={open}
      >
        <span
          className={`text-zinc-400 text-xs transition-transform ${
            open ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50 group-hover:underline">
          {title} ({items.length})
        </h2>
      </button>

      {open && (
        <>
          <ul
            className={`rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden ${listClassName}`}
          >
            {visible}
          </ul>

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 pt-1 text-sm">
              <button
                type="button"
                onClick={() => setPage(current - 1)}
                disabled={current === 0}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1 disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="이전 페이지"
              >
                ←
              </button>
              <span className="text-zinc-500 dark:text-zinc-400 tabular-nums">
                {current + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage(current + 1)}
                disabled={current >= pageCount - 1}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1 disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="다음 페이지"
              >
                →
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

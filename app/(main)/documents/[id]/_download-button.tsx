"use client";

import { useState, useTransition } from "react";
import { getDownloadUrlAction } from "../actions";

export function DownloadButton({
  storagePath,
  label,
  compact,
}: {
  storagePath: string;
  label: string;
  compact?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const r = await getDownloadUrlAction(storagePath);
      if (r.error) {
        setError(r.error);
        return;
      }
      if (r.url) {
        window.open(r.url, "_blank", "noopener,noreferrer");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={
          compact
            ? "text-xs rounded-md bg-blue-500 hover:bg-blue-600 text-white px-2.5 py-1 font-medium disabled:opacity-50"
            : "rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
        }
      >
        {isPending ? "처리중..." : label}
      </button>
      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 mt-1">
          {error}
        </div>
      )}
    </>
  );
}

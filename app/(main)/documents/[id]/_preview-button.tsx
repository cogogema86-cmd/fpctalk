"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

export function PreviewButton({
  url,
  title,
  label,
  compact,
}: {
  url: string;
  title: string;
  label?: string;
  compact?: boolean;
}) {
  const t = useT();
  const buttonLabel = label ?? t("documents.preview");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            : "text-sm rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        }
      >
        {buttonLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-2 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-white dark:bg-zinc-950 rounded-lg w-full max-w-5xl h-[95vh] sm:h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="font-semibold text-sm sm:text-base text-zinc-900 dark:text-zinc-50 truncate pr-4">
                {title}
              </h3>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  {t("preview.openNewTab")}
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  {t("preview.closeEsc")}
                </button>
              </div>
            </div>
            <iframe
              src={url}
              title={title}
              className="flex-1 w-full bg-zinc-100 dark:bg-zinc-900"
            />
          </div>
        </div>
      )}
    </>
  );
}

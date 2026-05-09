"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

const STEPS = [
  { key: "install.guide.step1" as const, image: "/install-guide/01.jpg" },
  { key: "install.guide.step2" as const, image: "/install-guide/02.jpg" },
  { key: "install.guide.step3" as const, image: "/install-guide/03.png" },
  { key: "install.guide.step4" as const, image: "/install-guide/04.jpg" },
  { key: "install.guide.step5" as const, image: "/install-guide/05.png" },
];

export function IosStepGuide() {
  const t = useT();
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [zoom]);

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-50">
        {t("install.guide.title")}
      </h3>
      <ol className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {STEPS.map((step, i) => (
          <li
            key={step.key}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden flex flex-col"
          >
            <button
              type="button"
              onClick={() => setZoom(step.image)}
              className="relative bg-zinc-50 dark:bg-zinc-900 aspect-[9/16] flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <img
                src={step.image}
                alt={`Step ${i + 1}`}
                className="max-w-full max-h-full object-contain"
                loading="lazy"
              />
              <span className="absolute top-1.5 left-1.5 inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold shadow">
                {i + 1}
              </span>
            </button>
            <div className="p-2.5 text-[11px] leading-snug text-zinc-700 dark:text-zinc-300">
              {t(step.key)}
            </div>
          </li>
        ))}
      </ol>

      {zoom && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoom(null)}
        >
          <img
            src={zoom}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
          <button
            type="button"
            onClick={() => setZoom(null)}
            className="absolute top-4 right-4 rounded-full bg-white/90 dark:bg-zinc-900/90 px-3 py-1.5 text-sm font-medium"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

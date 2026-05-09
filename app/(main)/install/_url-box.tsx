"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

const SITE_URL = "https://fpctalk.vercel.app";
const SITE_DISPLAY = "fpctalk.vercel.app";

export function UrlBox() {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      setCanShare(true);
    }
  }, []);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(SITE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 일부 환경에서 clipboard API 미지원 — fallback 안내
      alert(SITE_URL);
    }
  };

  const onShare = async () => {
    if (!navigator.share) {
      await onCopy();
      return;
    }
    try {
      await navigator.share({
        title: "FPCTalk",
        text: "Francis Parker Collegiate 학원 메신저",
        url: SITE_URL,
      });
    } catch {
      // 사용자 취소 — 무시
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {t("install.urlLabel")}
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 px-2.5 py-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-800 dark:text-zinc-200 truncate font-mono">
          {SITE_DISPLAY}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="text-xs rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 font-medium shrink-0 whitespace-nowrap"
        >
          {copied ? `✓ ${t("install.urlCopied")}` : `📋 ${t("install.urlCopy")}`}
        </button>
        {canShare && (
          <button
            type="button"
            onClick={onShare}
            className="text-xs rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 font-medium shrink-0 whitespace-nowrap hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            📤 {t("install.urlShare")}
          </button>
        )}
      </div>
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
        {t("install.urlHint")}
      </div>
    </div>
  );
}

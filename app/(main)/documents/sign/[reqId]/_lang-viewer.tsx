"use client";

import { useState } from "react";

export function LangViewer({
  koUrl,
  enUrl,
  isPdfKo,
  isPdfEn,
  koFileName,
  enFileName,
}: {
  koUrl: string | null;
  enUrl: string | null;
  isPdfKo: boolean;
  isPdfEn: boolean;
  koFileName: string;
  enFileName: string;
}) {
  const hasBoth = koUrl && enUrl;
  const [lang, setLang] = useState<"ko" | "en">("ko");

  const url = lang === "ko" ? koUrl : enUrl;
  const isPdf = lang === "ko" ? isPdfKo : isPdfEn;
  const fileName = lang === "ko" ? koFileName : enFileName;

  if (!url) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700">
        문서 링크 발급에 실패했습니다. 새로고침 후 다시 시도해주세요.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {hasBoth && (
        <div className="inline-flex rounded-md border border-zinc-200 dark:border-zinc-700 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setLang("ko")}
            className={`px-3 py-1 rounded ${
              lang === "ko"
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            🇰🇷 한국어
          </button>
          <button
            type="button"
            onClick={() => setLang("en")}
            className={`px-3 py-1 rounded ${
              lang === "en"
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            🇺🇸 English
          </button>
        </div>
      )}

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium"
      >
        📥 새 창에서 열기 / 다운로드
      </a>

      {isPdf ? (
        <iframe
          src={url}
          className="w-full h-72 md:h-96 border border-zinc-200 dark:border-zinc-800 rounded-md bg-white"
          title="문서 미리보기"
        />
      ) : (
        <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center text-sm text-zinc-500 bg-zinc-50 dark:bg-zinc-900">
          <div className="text-3xl mb-2">📎</div>
          PDF가 아닌 파일입니다 ({fileName}).
          <br />
          위 "📥 새 창에서 열기 / 다운로드" 버튼을 눌러 파일을 확인 후 사인해주세요.
        </div>
      )}
    </div>
  );
}

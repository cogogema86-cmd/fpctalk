"use client";

/**
 * 단순 다운로드 링크.
 * 모든 다운로드는 /api/files/[id] 프록시 라우트를 통해 진행됨
 * (권한 체크 + Supabase/Drive 자동 라우팅).
 */
export function DownloadButton({
  documentId,
  type,
  signRequestId,
  label,
  compact,
}: {
  documentId: string;
  type: "primary" | "en" | "signed";
  signRequestId?: string;
  label: string;
  compact?: boolean;
}) {
  const params = new URLSearchParams({ type });
  if (signRequestId) params.set("signRequestId", signRequestId);
  const href = `/api/files/${documentId}?${params.toString()}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        compact
          ? "text-xs rounded-md bg-blue-500 hover:bg-blue-600 text-white px-2.5 py-1 font-medium inline-block"
          : "rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 inline-block"
      }
    >
      {label}
    </a>
  );
}

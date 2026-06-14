"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

type Usage = {
  ok: true;
  totalBytes: number;
  objectCount: number;
  byPrefix: Record<string, { bytes: number; count: number }>;
  limitBytes: number;
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// R2 key 최상위 접두사 → 표시명 키
const PREFIX_LABEL: Record<string, string> = {
  chat: "dashboard.storage.cat.chat",
  templates: "dashboard.storage.cat.templates",
  signed: "dashboard.storage.cat.signed",
  signatures: "dashboard.storage.cat.signatures",
};

/**
 * 저장공간(R2) 사용량 카드 — 권한(canViewStorage) 있는 관리자에게만 대시보드에서 렌더됨.
 * 마운트 시 /api/admin/storage 를 비동기로 불러와 대시보드 로딩을 막지 않는다.
 */
export function StorageCard() {
  const t = useT();
  const [data, setData] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/storage")
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (!r.ok || !j.ok) setError(j.error ?? "error");
        else setData(j as Usage);
      })
      .catch(() => alive && setError("network"));
    return () => {
      alive = false;
    };
  }, []);

  const pct =
    data && data.limitBytes > 0
      ? Math.min(100, (data.totalBytes / data.limitBytes) * 100)
      : 0;
  const barColor =
    pct >= 90
      ? "bg-red-500"
      : pct >= 70
        ? "bg-amber-500"
        : "bg-emerald-500";

  const entries = data
    ? Object.entries(data.byPrefix).sort((a, b) => b[1].bytes - a[1].bytes)
    : [];

  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
          💾 {t("dashboard.storage.title")}
        </h2>
        {data && (
          <span className="text-xs text-zinc-400">
            {t("dashboard.storage.objects").replace(
              "{n}",
              String(data.objectCount),
            )}
          </span>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">
          {t("dashboard.storage.error")}
        </div>
      )}

      {!error && !data && (
        <div className="text-sm text-zinc-400">
          {t("dashboard.storage.loading")}
        </div>
      )}

      {data && (
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {fmtBytes(data.totalBytes)}
            </span>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              / {fmtBytes(data.limitBytes)} ({pct.toFixed(1)}%)
            </span>
          </div>

          <div className="h-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
            <div
              className={`h-full rounded-full ${barColor} transition-all`}
              style={{ width: `${Math.max(pct, 1)}%` }}
            />
          </div>

          <div className="text-xs text-zinc-400">
            {t("dashboard.storage.free")}
          </div>

          {entries.length > 0 && (
            <ul className="pt-1 space-y-1 text-sm">
              {entries.map(([prefix, v]) => (
                <li
                  key={prefix}
                  className="flex items-center justify-between text-zinc-600 dark:text-zinc-300"
                >
                  <span>
                    {t(
                      (PREFIX_LABEL[prefix] ??
                        "dashboard.storage.cat.other") as Parameters<
                        typeof t
                      >[0],
                    )}
                  </span>
                  <span className="tabular-nums text-zinc-500">
                    {fmtBytes(v.bytes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

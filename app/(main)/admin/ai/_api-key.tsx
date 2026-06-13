"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setGeminiApiKeyAction, clearGeminiApiKeyAction } from "./actions";

/**
 * Gemini API 키 관리 (관리자 전용).
 * 키 전체는 화면에 노출하지 않고 출처/마스킹만 보여준다.
 * 새 키 입력→저장 시 재배포 없이 즉시 반영.
 */
export function ApiKeySection({
  source,
  hint,
}: {
  source: "db" | "env" | "none";
  hint: string;
}) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const save = () => {
    setMsg(null);
    startTransition(async () => {
      const r = await setGeminiApiKeyAction(key);
      if (!r.ok) {
        setMsg({ ok: false, text: r.error ?? "저장 실패" });
        return;
      }
      setKey("");
      setMsg({ ok: true, text: "✅ API 키 저장됨 — 즉시 반영" });
      router.refresh();
    });
  };

  const clear = () => {
    if (
      !confirm(
        "저장된 API 키를 삭제하고 환경변수 키로 되돌릴까요?\n(환경변수가 없으면 AI가 동작하지 않습니다)",
      )
    )
      return;
    setMsg(null);
    startTransition(async () => {
      const r = await clearGeminiApiKeyAction();
      if (!r.ok) {
        setMsg({ ok: false, text: r.error ?? "삭제 실패" });
        return;
      }
      setMsg({ ok: true, text: "삭제됨 — 환경변수 키로 복귀" });
      router.refresh();
    });
  };

  const statusText =
    source === "db"
      ? `현재 키: 직접 입력값 사용 중 (${hint})`
      : source === "env"
        ? `현재 키: 환경변수 사용 중 (${hint})`
        : "현재 키: 설정 안 됨 ⚠ (AI 동작 불가)";

  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          🔑 제미나이 API 키 (관리자 전용)
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          유료 전환 등으로 API 키를 바꿔야 할 때 여기에 입력하면 재배포 없이
          즉시 반영됩니다. 입력한 키는 보안상 다시 표시되지 않고 끝 4자리만
          보입니다.
        </p>
      </div>

      <div
        className={`text-xs ${
          source === "none"
            ? "text-red-600 dark:text-red-400"
            : "text-zinc-600 dark:text-zinc-300"
        }`}
      >
        {statusText}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="새 API 키 입력 (AIza...)"
          autoComplete="off"
          className="flex-1 min-w-[220px] rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-500"
        />
        <button
          type="button"
          onClick={save}
          disabled={isPending || !key.trim()}
          className="shrink-0 rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "API 키 저장"}
        </button>
        {source === "db" && (
          <button
            type="button"
            onClick={clear}
            disabled={isPending}
            className="shrink-0 rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
          >
            저장된 키 삭제
          </button>
        )}
      </div>

      {msg && (
        <div
          className={`text-xs ${
            msg.ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}

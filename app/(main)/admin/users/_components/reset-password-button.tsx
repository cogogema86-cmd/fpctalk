"use client";

import { useState, useTransition } from "react";
import { resetPasswordAction } from "../actions";
import { CredentialsCard } from "./credentials-card";

type Mode = "idle" | "form" | "result";

export function ResetPasswordButton({
  userId,
  username,
  name,
}: {
  userId: string;
  username: string;
  name: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    newPassword: string;
    username: string;
  } | null>(null);
  const [customPw, setCustomPw] = useState("");
  const [useRandom, setUseRandom] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const reset = () => {
    setMode("idle");
    setError(null);
    setResult(null);
    setCustomPw("");
    setUseRandom(false);
    setShowPw(false);
  };

  const handleStart = () => {
    if (
      !confirm(
        `${name}(${username})님의 비밀번호를 재설정하시겠습니까?`,
      )
    )
      return;
    setError(null);
    setResult(null);
    setCustomPw("");
    setUseRandom(false);
    setShowPw(false);
    setMode("form");
  };

  const handleSubmit = () => {
    setError(null);
    if (!useRandom) {
      const pw = customPw.trim();
      if (pw.length < 6) {
        setError("비밀번호는 6자 이상이어야 합니다.");
        return;
      }
    }
    startTransition(async () => {
      const r = await resetPasswordAction(
        userId,
        useRandom ? undefined : customPw,
      );
      if (r.error) {
        setError(r.error);
        return;
      }
      if (r.newPassword && r.username) {
        setResult({ newPassword: r.newPassword, username: r.username });
        setMode("result");
      }
    });
  };

  if (mode === "result" && result) {
    return (
      <div className="my-2">
        <CredentialsCard
          title={`🔑 ${name}님의 비밀번호가 재설정되었습니다`}
          username={result.username}
          name={name}
          password={result.newPassword}
        />
        <button
          type="button"
          onClick={reset}
          className="mt-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          닫기
        </button>
      </div>
    );
  }

  if (mode === "form") {
    return (
      <div className="my-2 rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/30 p-3 space-y-2">
        <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {name}({username})님 비밀번호 재설정
        </div>

        <div className="flex items-center gap-1.5">
          <input
            type={showPw ? "text" : "password"}
            value={customPw}
            onChange={(e) => setCustomPw(e.target.value)}
            disabled={isPending || useRandom}
            placeholder="새 비밀번호 (6자 이상)"
            autoComplete="new-password"
            className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            disabled={useRandom}
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-1.5 disabled:opacity-50"
          >
            {showPw ? "숨김" : "보기"}
          </button>
        </div>

        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={useRandom}
            onChange={(e) => {
              setUseRandom(e.target.checked);
              if (e.target.checked) setCustomPw("");
            }}
            disabled={isPending}
          />
          <span>또는 랜덤 자동 생성 (10자 영문+숫자)</span>
        </label>

        {error && (
          <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || (!useRandom && customPw.trim().length < 6)}
            className="text-xs rounded-md bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 font-medium disabled:opacity-50"
          >
            {isPending ? "처리 중..." : "✓ 재설정"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={isPending}
            className="text-xs rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5"
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleStart}
      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
    >
      비번 재설정
    </button>
  );
}

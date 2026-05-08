"use client";

import { useState, useTransition } from "react";
import { resetPasswordAction } from "../actions";
import { CredentialsCard } from "./credentials-card";

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
  const [result, setResult] = useState<
    { newPassword: string; username: string } | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    if (!confirm(`${name}(${username})님의 비밀번호를 재설정하시겠습니까?`)) {
      return;
    }
    setError(null);
    setResult(null);
    startTransition(async () => {
      const r = await resetPasswordAction(userId);
      if (r.error) setError(r.error);
      else if (r.newPassword && r.username) {
        setResult({ newPassword: r.newPassword, username: r.username });
      }
    });
  };

  if (result) {
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
          onClick={() => setResult(null)}
          className="mt-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          닫기
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
      >
        {isPending ? "처리 중..." : "비번 재설정"}
      </button>
      {error && (
        <span className="ml-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </>
  );
}

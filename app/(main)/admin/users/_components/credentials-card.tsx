"use client";

import { useState } from "react";

export function CredentialsCard({
  title,
  username,
  name,
  password,
}: {
  title: string;
  username: string;
  name?: string;
  password: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    const text = name
      ? `이름: ${name}\n아이디: ${username}\n비밀번호: ${password}`
      : `아이디: ${username}\n비밀번호: ${password}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border-2 border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/40 p-4 space-y-3">
      <div className="font-semibold text-yellow-900 dark:text-yellow-100">
        {title}
      </div>

      <div className="rounded-md bg-white dark:bg-black px-4 py-3 font-mono text-sm space-y-1">
        {name && (
          <div>
            <span className="text-zinc-500">이름:</span>{" "}
            <span className="text-zinc-900 dark:text-zinc-50">{name}</span>
          </div>
        )}
        <div>
          <span className="text-zinc-500">아이디:</span>{" "}
          <span className="text-zinc-900 dark:text-zinc-50">{username}</span>
        </div>
        <div>
          <span className="text-zinc-500">비밀번호:</span>{" "}
          <span className="text-zinc-900 dark:text-zinc-50 select-all">
            {password}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-yellow-800 dark:text-yellow-300">
          ⚠️ 이 비밀번호는 <strong>지금만</strong> 표시됩니다. 직원에게 전달하고
          페이지를 닫으세요.
        </p>
        <button
          type="button"
          onClick={copyAll}
          className="text-xs rounded-md bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 font-medium shrink-0"
        >
          {copied ? "✓ 복사됨" : "📋 복사"}
        </button>
      </div>
    </div>
  );
}

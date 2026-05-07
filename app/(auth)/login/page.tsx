"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          FPCTalk
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Francis Parker 학원 직원용 메신저
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <div>
          <label
            htmlFor="username"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
          >
            아이디
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            disabled={isPending}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
            placeholder="예: parker"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
          >
            비밀번호
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={isPending}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
          />
        </div>

        {state.error && (
          <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
        >
          {isPending ? "로그인 중..." : "로그인"}
        </button>
      </form>

      <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
        로그인 정보는 관리자(원장)에게 문의하세요.
      </p>
    </div>
  );
}

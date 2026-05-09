"use client";

import { useActionState, useEffect, useState } from "react";
import { loginAction, type LoginState } from "./actions";
import { useT } from "@/lib/i18n/client";

const initialState: LoginState = {};
const REMEMBER_USERNAME_KEY = "fpctalk:lastUsername";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const t = useT();

  const [username, setUsername] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  // 마지막 로그인했던 username 자동 입력 (localStorage)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const last = localStorage.getItem(REMEMBER_USERNAME_KEY) ?? "";
      if (last) setUsername(last);
    } catch {
      // ignore
    }
  }, []);

  // 폼 제출 시 username을 localStorage에 저장 (rememberMe ON일 때만)
  const onSubmit = () => {
    try {
      if (rememberMe) {
        localStorage.setItem(REMEMBER_USERNAME_KEY, username.trim());
      } else {
        localStorage.removeItem(REMEMBER_USERNAME_KEY);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          FPCTalk
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {t("login.brand")}
        </p>
      </div>

      <form action={formAction} onSubmit={onSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="username"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
          >
            {t("login.username")}
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            disabled={isPending}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
            placeholder={t("login.usernamePh")}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
          >
            {t("login.password")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={isPending}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
            placeholder={t("login.passwordPh")}
          />
        </div>

        <label className="flex items-start gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            name="rememberMe"
            value="1"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            disabled={isPending}
            className="mt-0.5 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
          />
          <span className="text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {t("login.rememberMe")}
            </span>
            <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {t("login.rememberMeHint")}
            </span>
          </span>
        </label>

        {state.error && (
          <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300 space-y-1">
            <div>{state.error}</div>
            {state.debug && (
              <div className="text-xs opacity-70 break-all">
                debug: {state.debug}
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
        >
          {isPending ? t("login.signing") : t("login.submit")}
        </button>
      </form>

      <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
        {t("login.contactAdmin")}
      </p>
    </div>
  );
}

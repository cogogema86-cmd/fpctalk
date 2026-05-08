"use client";

import { useActionState } from "react";
import {
  changePasswordAction,
  type ChangePasswordState,
} from "./actions";

const initialState: ChangePasswordState = {};

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(
    changePasswordAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field label="기존 비밀번호" required>
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
          className="pw-input"
        />
      </Field>

      <Field label="새 비밀번호 (최소 6자)" required>
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          disabled={isPending}
          className="pw-input"
        />
      </Field>

      <Field label="새 비밀번호 확인" required>
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          disabled={isPending}
          className="pw-input"
        />
      </Field>

      {state.error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-md bg-green-50 dark:bg-green-950 px-3 py-2 text-sm text-green-700 dark:text-green-300">
          ✅ {state.success}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
      >
        {isPending ? "변경 중..." : "비밀번호 변경"}
      </button>

      <style>{`
        .pw-input {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgb(212 212 216);
          background: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(24 24 27);
        }
        .pw-input:focus { outline: none; box-shadow: 0 0 0 2px rgb(113 113 122); }
        .pw-input:disabled { opacity: 0.5; }
        @media (prefers-color-scheme: dark) {
          .pw-input { border-color: rgb(63 63 70); background: rgb(9 9 11); color: rgb(244 244 245); }
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createStaffAction, type CreateStaffState } from "../actions";
import { CredentialsCard } from "../_components/credentials-card";

const initialState: CreateStaffState = {};

const ROLES = [
  { value: "TEACHER", label: "강사" },
  { value: "ASSISTANT", label: "동승" },
  { value: "DRIVER", label: "기사" },
  { value: "STAFF", label: "일반 직원" },
  { value: "VICE", label: "부원장" },
  { value: "PRINCIPAL", label: "원장" },
];

export function CreateStaffForm() {
  const [state, formAction, isPending] = useActionState(
    createStaffAction,
    initialState,
  );
  const [autoPw, setAutoPw] = useState(true);

  // 성공 시 결과 표시
  if (state.success) {
    return (
      <div className="space-y-4">
        <CredentialsCard
          title="✅ 직원 계정이 생성되었습니다"
          username={state.success.username}
          name={state.success.name}
          password={state.success.password}
        />
        <div className="flex gap-2">
          <Link
            href="/admin/users"
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900"
          >
            목록으로
          </Link>
          <Link
            href="/admin/users/new"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm"
          >
            추가로 한 명 더 등록
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field label="아이디 (영문/숫자, 3~20자)" required>
        <input
          name="username"
          type="text"
          autoComplete="off"
          required
          disabled={isPending}
          placeholder="예: kim_teacher, parker"
          className="input"
        />
      </Field>

      <Field label="이름" required>
        <input
          name="name"
          type="text"
          required
          disabled={isPending}
          placeholder="예: 김강사"
          className="input"
        />
      </Field>

      <Field label="역할" required>
        <select
          name="role"
          defaultValue="TEACHER"
          required
          disabled={isPending}
          className="input"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoPw}
            onChange={(e) => setAutoPw(e.target.checked)}
            disabled={isPending}
          />
          <span>비밀번호 자동 생성 (10자 영문+숫자)</span>
        </label>
        {!autoPw && (
          <Field label="비밀번호 (직접 입력)">
            <input
              name="password"
              type="text"
              autoComplete="new-password"
              minLength={6}
              disabled={isPending}
              placeholder="최소 6자"
              className="input"
            />
          </Field>
        )}
      </div>

      {state.error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {state.error}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
        >
          {isPending ? "생성 중..." : "직원 추가"}
        </button>
        <Link
          href="/admin/users"
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm"
        >
          취소
        </Link>
      </div>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgb(212 212 216);
          background: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(24 24 27);
        }
        .input:focus {
          outline: none;
          box-shadow: 0 0 0 2px rgb(113 113 122);
        }
        .input:disabled { opacity: 0.5; }
        @media (prefers-color-scheme: dark) {
          .input { border-color: rgb(63 63 70); background: rgb(9 9 11); color: rgb(244 244 245); }
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

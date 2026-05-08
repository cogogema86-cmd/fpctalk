"use client";

import { useActionState, useEffect, useRef } from "react";
import { createRoleAction, type RoleFormState } from "../actions";

const initialState: RoleFormState = {};

export function CreateRoleForm() {
  const [state, formAction, isPending] = useActionState(
    createRoleAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success && formRef.current) {
      formRef.current.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium mb-1">역할 이름 *</label>
          <input
            name="label"
            type="text"
            required
            disabled={isPending}
            placeholder="예: 교무부장, 회계, 행정실장"
            className="role-input"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">기본 레벨</label>
          <input
            name="defaultLevel"
            type="number"
            min={0}
            max={99}
            defaultValue={0}
            disabled={isPending}
            className="role-input"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">정렬</label>
          <input
            name="sortOrder"
            type="number"
            defaultValue="100"
            disabled={isPending}
            className="role-input"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          name="isAdmin"
          type="checkbox"
          disabled={isPending}
        />
        <span>관리권한 부여 (직원·역할·비번 관리 메뉴 접근 가능)</span>
      </label>

      {state.error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
      >
        {isPending ? "추가 중..." : "+ 역할 추가"}
      </button>

      <style>{`
        .role-input {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgb(212 212 216);
          background: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(24 24 27);
        }
        .role-input:focus { outline: none; box-shadow: 0 0 0 2px rgb(113 113 122); }
        .role-input:disabled { opacity: 0.5; }
        @media (prefers-color-scheme: dark) {
          .role-input { border-color: rgb(63 63 70); background: rgb(9 9 11); color: rgb(244 244 245); }
        }
      `}</style>
    </form>
  );
}

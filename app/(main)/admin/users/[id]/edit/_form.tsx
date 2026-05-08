"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateStaffAction, type UpdateStaffState } from "../../actions";

const initialState: UpdateStaffState = {};

type RoleOption = {
  id: string;
  label: string;
  isAdmin: boolean;
};

type UserData = {
  id: string;
  username: string;
  name: string;
  roleId: string;
  title: string | null;
};

export function EditStaffForm({
  user,
  roles,
  isSelf,
}: {
  user: UserData;
  roles: RoleOption[];
  isSelf: boolean;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    updateStaffAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      // 저장 후 목록으로
      router.push("/admin/users");
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={user.id} />

      <Field label="아이디 (영문/숫자/_/-, 3~20자)" required>
        <input
          name="username"
          type="text"
          required
          disabled={isPending}
          defaultValue={user.username}
          className="input"
        />
        <p className="mt-1 text-xs text-zinc-500">
          ⚠️ 아이디 변경 시 본인 로그인 정보도 함께 바뀝니다.
        </p>
      </Field>

      <Field label="이름" required>
        <input
          name="name"
          type="text"
          required
          disabled={isPending}
          defaultValue={user.name}
          className="input"
        />
      </Field>

      <Field label="역할" required>
        <select
          name="roleId"
          defaultValue={user.roleId}
          required
          disabled={isPending}
          className="input"
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label} {r.isAdmin ? "(관리권한)" : ""}
            </option>
          ))}
        </select>
        {isSelf && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            ⚠️ 본인의 역할은 관리권한이 있는 역할로만 변경 가능합니다 (잠금 방지)
          </p>
        )}
      </Field>

      <Field label="직책 (선택)">
        <input
          name="title"
          type="text"
          disabled={isPending}
          defaultValue={user.title ?? ""}
          placeholder="예: 수석강사, 교무부장"
          className="input"
        />
      </Field>

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
          {isPending ? "저장 중..." : "저장"}
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
        .input:focus { outline: none; box-shadow: 0 0 0 2px rgb(113 113 122); }
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

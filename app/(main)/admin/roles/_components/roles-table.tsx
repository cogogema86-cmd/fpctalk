"use client";

import { Fragment, useActionState, useEffect, useState, useTransition } from "react";
import { deleteRoleAction, updateRoleAction, type RoleFormState } from "../actions";

type Role = {
  id: string;
  code: string;
  label: string;
  defaultLevel: number;
  isAdmin: boolean;
  isSystem: boolean;
  sortOrder: number;
  _count: { users: number };
};

export function RolesTable({ roles }: { roles: Role[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <table className="w-full text-sm">
      <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
        <tr>
          <th className="text-left px-4 py-2 font-medium">이름</th>
          <th className="text-left px-4 py-2 font-medium">레벨</th>
          <th className="text-left px-4 py-2 font-medium">관리권한</th>
          <th className="text-left px-4 py-2 font-medium">분류</th>
          <th className="text-left px-4 py-2 font-medium">사용중</th>
          <th className="text-left px-4 py-2 font-medium">관리</th>
        </tr>
      </thead>
      <tbody>
        {roles.map((r) => (
          <Fragment key={r.id}>
            <DisplayRow
              role={r}
              isEditing={editingId === r.id}
              onEdit={() => setEditingId(r.id)}
            />
            {editingId === r.id && (
              <EditFormRow role={r} onClose={() => setEditingId(null)} />
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

function DisplayRow({
  role,
  isEditing,
  onEdit,
}: {
  role: Role;
  isEditing: boolean;
  onEdit: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    if (
      !confirm(
        `"${role.label}" 역할을 삭제하시겠습니까? (사용 중인 직원이 있으면 거부됩니다)`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const r = await deleteRoleAction(role.id);
      if (r.error) setError(r.error);
    });
  };

  return (
    <>
      <tr
        className={`border-t border-zinc-200 dark:border-zinc-800 ${
          isEditing ? "bg-zinc-50 dark:bg-zinc-900" : ""
        }`}
      >
        <td className="px-4 py-2 font-medium">{role.label}</td>
        <td className="px-4 py-2">{role.defaultLevel}</td>
        <td className="px-4 py-2">
          {role.isAdmin ? (
            <span className="text-amber-600 dark:text-amber-400">⚙️ 있음</span>
          ) : (
            <span className="text-zinc-400">없음</span>
          )}
        </td>
        <td className="px-4 py-2">
          {role.isSystem ? (
            <span className="text-xs rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-1.5 py-0.5">
              시스템
            </span>
          ) : (
            <span className="text-xs rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 px-1.5 py-0.5">
              커스텀
            </span>
          )}
        </td>
        <td className="px-4 py-2 text-zinc-500">{role._count.users}명</td>
        <td className="px-4 py-2 space-x-2">
          <button
            type="button"
            onClick={onEdit}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {isEditing ? "편집 중" : "편집"}
          </button>
          {!role.isSystem && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
            >
              {isPending ? "삭제 중..." : "삭제"}
            </button>
          )}
          {role.isSystem && (
            <span className="text-xs text-zinc-400">시스템(삭제 불가)</span>
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td
            colSpan={6}
            className="px-4 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950"
          >
            {error}
          </td>
        </tr>
      )}
    </>
  );
}

const initialState: RoleFormState = {};

function EditFormRow({ role, onClose }: { role: Role; onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(
    updateRoleAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) onClose();
  }, [state.success, onClose]);

  return (
    <tr className="bg-blue-50/50 dark:bg-blue-950/20 border-t border-blue-200 dark:border-blue-900">
      <td colSpan={6} className="px-4 py-3">
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={role.id} />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium mb-1">
                역할 이름 *
              </label>
              <input
                name="label"
                type="text"
                required
                disabled={isPending}
                defaultValue={role.label}
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
                defaultValue={role.defaultLevel}
                disabled={isPending}
                className="role-input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">정렬</label>
              <input
                name="sortOrder"
                type="number"
                defaultValue={role.sortOrder}
                disabled={isPending}
                className="role-input"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              name="isAdmin"
              type="checkbox"
              defaultChecked={role.isAdmin}
              disabled={isPending}
            />
            <span>
              관리권한 부여 (직원·역할·비번 관리 메뉴 접근 가능)
            </span>
          </label>

          {role.isSystem && (
            <p className="text-xs text-zinc-500">
              💡 시스템 기본 역할이지만 라벨/레벨/관리권한 모두 변경 가능합니다.
              (코드 식별자 <span className="font-mono">{role.code}</span>는 변경되지 않음)
            </p>
          )}

          {state.error && (
            <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {state.error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
            >
              {isPending ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-sm"
            >
              취소
            </button>
          </div>

          <style>{`
            .role-input {
              width: 100%;
              border-radius: 0.375rem;
              border: 1px solid rgb(212 212 216);
              background: white;
              padding: 0.4rem 0.6rem;
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
      </td>
    </tr>
  );
}

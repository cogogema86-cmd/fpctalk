"use client";

import { useState, useTransition } from "react";
import { deleteRoleAction } from "../actions";

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
          <RoleRow key={r.id} role={r} />
        ))}
      </tbody>
    </table>
  );
}

function RoleRow({ role }: { role: Role }) {
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
      <tr className="border-t border-zinc-200 dark:border-zinc-800">
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
        <td className="px-4 py-2">
          {role.isSystem ? (
            <span className="text-xs text-zinc-400">시스템 역할</span>
          ) : (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
            >
              {isPending ? "삭제 중..." : "삭제"}
            </button>
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

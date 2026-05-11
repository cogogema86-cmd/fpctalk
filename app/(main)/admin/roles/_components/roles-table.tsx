"use client";

import { Fragment, useActionState, useEffect, useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";
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
  const t = useT();
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <table className="w-full text-sm">
      <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
        <tr>
          <th className="text-left px-4 py-2 font-medium">{t("admin.roles.col.name")}</th>
          <th className="text-left px-4 py-2 font-medium">{t("admin.roles.col.level")}</th>
          <th className="text-left px-4 py-2 font-medium">{t("admin.roles.col.admin")}</th>
          <th className="text-left px-4 py-2 font-medium">{t("admin.roles.col.category")}</th>
          <th className="text-left px-4 py-2 font-medium">{t("admin.roles.col.inUse")}</th>
          <th className="text-left px-4 py-2 font-medium">{t("admin.roles.col.actions")}</th>
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
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    if (
      !confirm(
        `"${role.label}" — ${t("admin.roles.deleteConfirm")}`,
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
            <span className="text-amber-600 dark:text-amber-400">
              {t("admin.roles.adminYes")}
            </span>
          ) : (
            <span className="text-zinc-400">{t("admin.roles.adminNo")}</span>
          )}
        </td>
        <td className="px-4 py-2">
          {role.isSystem ? (
            <span className="text-xs rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-1.5 py-0.5">
              {t("admin.roles.systemBadge")}
            </span>
          ) : (
            <span className="text-xs rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 px-1.5 py-0.5">
              {t("admin.roles.customBadge")}
            </span>
          )}
        </td>
        <td className="px-4 py-2 text-zinc-500">
          {role._count.users}
          {t("admin.roles.userCountSuffix")}
        </td>
        <td className="px-4 py-2 space-x-2">
          <button
            type="button"
            onClick={onEdit}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {isEditing ? t("admin.roles.editing") : t("common.edit")}
          </button>
          {!role.isSystem && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
            >
              {isPending ? t("admin.roles.deleting") : t("common.delete")}
            </button>
          )}
          {role.isSystem && (
            <span className="text-xs text-zinc-400">
              {t("admin.roles.systemNoDelete")}
            </span>
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
  const t = useT();
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
                {t("admin.roles.field.label")}{" "}
                <span className="text-red-500">*</span>
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
              <label className="block text-xs font-medium mb-1">
                {t("admin.roles.field.defaultLevel")}
              </label>
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
              <label className="block text-xs font-medium mb-1">
                {t("admin.roles.field.sortOrder")}
              </label>
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
            <span>{t("admin.roles.field.isAdmin")}</span>
          </label>

          {role.isSystem && (
            <p className="text-xs text-zinc-500">
              {t("admin.roles.systemEditHint")}{" "}
              <span className="font-mono">{role.code}</span>
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
              {isPending ? t("common.saving") : t("common.save")}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-sm"
            >
              {t("common.cancel")}
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

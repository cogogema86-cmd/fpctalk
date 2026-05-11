"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
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
  joinDate: string; // yyyy-mm-dd or ""
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
  const t = useT();
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

      <Field label={t("admin.users.field.usernameEdit")} required>
        <input
          name="username"
          type="text"
          required
          disabled={isPending}
          defaultValue={user.username}
          className="input"
        />
        <p className="mt-1 text-xs text-zinc-500">
          {t("admin.users.field.usernameEditWarn")}
        </p>
      </Field>

      <Field label={t("admin.users.field.name")} required>
        <input
          name="name"
          type="text"
          required
          disabled={isPending}
          defaultValue={user.name}
          className="input"
        />
      </Field>

      <Field label={t("admin.users.field.role")} required>
        <select
          name="roleId"
          defaultValue={user.roleId}
          required
          disabled={isPending}
          className="input"
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label} {r.isAdmin ? t("admin.users.adminBadge") : ""}
            </option>
          ))}
        </select>
        {isSelf && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            {t("admin.users.selfRoleWarn")}
          </p>
        )}
      </Field>

      <Field label={t("admin.users.field.title")}>
        <input
          name="title"
          type="text"
          disabled={isPending}
          defaultValue={user.title ?? ""}
          placeholder={t("admin.users.field.titleExample")}
          className="input"
        />
      </Field>

      <Field label={t("admin.users.field.joinDate")}>
        <input
          name="joinDate"
          type="date"
          disabled={isPending}
          defaultValue={user.joinDate}
          className="input"
        />
        <p className="mt-1 text-xs text-zinc-500">
          {t("admin.users.field.joinDateEditHint")}
        </p>
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
          {isPending ? t("common.saving") : t("common.save")}
        </button>
        <Link
          href="/admin/users"
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm"
        >
          {t("common.cancel")}
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

"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { createStaffAction, type CreateStaffState } from "../actions";
import { CredentialsCard } from "../_components/credentials-card";

const initialState: CreateStaffState = {};

type RoleOption = {
  id: string;
  code: string;
  label: string;
  isAdmin: boolean;
};

/**
 * 외부 컴포넌트 — 리셋용 key를 관리.
 * "추가로 한 명 더 등록" 클릭 시 키를 증가시켜
 * 자식의 useActionState가 새 인스턴스로 시작되게 함.
 */
export function CreateStaffForm({ roles }: { roles: RoleOption[] }) {
  const [resetKey, setResetKey] = useState(0);
  return (
    <FormInstance
      key={resetKey}
      roles={roles}
      onReset={() => setResetKey((k) => k + 1)}
    />
  );
}

function FormInstance({
  roles,
  onReset,
}: {
  roles: RoleOption[];
  onReset: () => void;
}) {
  const t = useT();
  const [state, formAction, isPending] = useActionState(
    createStaffAction,
    initialState,
  );
  const [autoPw, setAutoPw] = useState(true);

  if (state.success) {
    return (
      <div className="space-y-4">
        <CredentialsCard
          title={t("admin.users.createSuccess")}
          username={state.success.username}
          name={state.success.name}
          password={state.success.password}
        />
        <div className="flex gap-2">
          <Link
            href="/admin/users"
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900"
          >
            {t("admin.users.backToList")}
          </Link>
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            {t("admin.users.addAnother")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field label={t("admin.users.field.username")} required>
        <input
          name="username"
          type="text"
          autoComplete="off"
          required
          disabled={isPending}
          placeholder={t("admin.users.field.usernameExample")}
          className="input"
        />
      </Field>

      <Field label={t("admin.users.field.name")} required>
        <input
          name="name"
          type="text"
          required
          disabled={isPending}
          placeholder={t("admin.users.field.nameExample")}
          className="input"
        />
      </Field>

      <Field label={t("admin.users.field.role")} required>
        <select
          name="roleId"
          defaultValue=""
          required
          disabled={isPending}
          className="input"
        >
          <option value="" disabled>
            {t("common.selectPlaceholder")}
          </option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label} {r.isAdmin ? t("admin.users.adminBadge") : ""}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500">
          {t("admin.users.roleNotFoundPrefix")}{" "}
          <Link href="/admin/roles" className="underline">
            {t("nav.adminRoles")}
          </Link>{" "}
          {t("admin.users.roleNotFoundSuffix")}
        </p>
      </Field>

      <Field label={t("admin.users.field.title")}>
        <input
          name="title"
          type="text"
          disabled={isPending}
          placeholder={t("admin.users.field.titleExample")}
          className="input"
        />
      </Field>

      <Field label={t("admin.users.field.joinDateOptional")}>
        <input
          name="joinDate"
          type="date"
          disabled={isPending}
          className="input"
        />
        <p className="mt-1 text-xs text-zinc-500">
          {t("admin.users.field.joinDateHint")}
        </p>
      </Field>

      <Field label={t("admin.users.field.annualLeaveTotal")}>
        <input
          name="annualLeaveTotal"
          type="number"
          step="0.5"
          min="0"
          max="365"
          disabled={isPending}
          placeholder={t("admin.users.field.annualLeaveTotalExample")}
          className="input"
        />
        <p className="mt-1 text-xs text-zinc-500">
          {t("admin.users.field.annualLeaveTotalHint")}
        </p>
      </Field>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoPw}
            onChange={(e) => setAutoPw(e.target.checked)}
            disabled={isPending}
          />
          <span>{t("admin.users.autoPasswordLabel")}</span>
        </label>
        {!autoPw && (
          <Field label={t("admin.users.field.passwordManual")}>
            <input
              name="password"
              type="text"
              autoComplete="new-password"
              minLength={6}
              disabled={isPending}
              placeholder={t("admin.users.field.passwordMinHint")}
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
          {isPending ? t("admin.users.creating") : t("admin.users.create")}
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

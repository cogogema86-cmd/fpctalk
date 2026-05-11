"use client";

import { useActionState, useState, useEffect } from "react";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dictionary";
import { requestLeaveAction, type LeaveFormState } from "./actions";

const initialState: LeaveFormState = {};

const TYPES: { value: string; labelKey: DictKey }[] = [
  { value: "ANNUAL", labelKey: "leave.type.ANNUAL.long" },
  { value: "HALF_AM", labelKey: "leave.type.HALF_AM.long" },
  { value: "HALF_PM", labelKey: "leave.type.HALF_PM.long" },
  { value: "SICK", labelKey: "leave.type.SICK" },
  { value: "OFFICIAL", labelKey: "leave.type.OFFICIAL" },
  { value: "OTHER", labelKey: "leave.type.OTHER" },
];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function LeaveForm({ remaining }: { remaining: number }) {
  const [resetKey, setResetKey] = useState(0);
  return (
    <FormInstance
      key={resetKey}
      remaining={remaining}
      onReset={() => setResetKey((k) => k + 1)}
    />
  );
}

function FormInstance({
  remaining,
  onReset,
}: {
  remaining: number;
  onReset: () => void;
}) {
  const t = useT();
  const [state, formAction, isPending] = useActionState(
    requestLeaveAction,
    initialState,
  );
  const [type, setType] = useState("ANNUAL");
  const isHalf = type === "HALF_AM" || type === "HALF_PM";

  useEffect(() => {
    if (state.success) {
      // 1초 후 폼 리셋
      const t = setTimeout(onReset, 1500);
      return () => clearTimeout(t);
    }
  }, [state.success, onReset]);

  if (state.success) {
    return (
      <div className="rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 p-4 text-sm text-green-800 dark:text-green-200">
        {t("leave.success")}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">
        {t("leave.remaining.label")} {remaining}
        {t("leave.remaining.unit")}
      </div>

      <Field label={t("leave.field.type")} required>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          required
          disabled={isPending}
          className="lv-input"
        >
          {TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("leave.field.startDate")} required>
          <input
            name="startDate"
            type="date"
            required
            disabled={isPending}
            min={today()}
            className="lv-input"
          />
        </Field>
        {!isHalf && (
          <Field label={t("leave.field.endDate")} required>
            <input
              name="endDate"
              type="date"
              required
              disabled={isPending}
              min={today()}
              className="lv-input"
            />
          </Field>
        )}
      </div>

      <Field label={t("leave.field.reason")}>
        <textarea
          name="reason"
          rows={2}
          disabled={isPending}
          placeholder={t("leave.field.reasonPlaceholder")}
          className="lv-input"
        />
      </Field>

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
        {isPending ? t("leave.submitting") : t("leave.submit")}
      </button>

      <style>{`
        .lv-input {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgb(212 212 216);
          background: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(24 24 27);
        }
        .lv-input:focus { outline: none; box-shadow: 0 0 0 2px rgb(113 113 122); }
        .lv-input:disabled { opacity: 0.5; }
        @media (prefers-color-scheme: dark) {
          .lv-input { border-color: rgb(63 63 70); background: rgb(9 9 11); color: rgb(244 244 245); }
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
      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

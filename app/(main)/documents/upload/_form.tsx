"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  saveTemplateAction,
  type SaveTemplateState,
} from "../template-actions";
import { useT } from "@/lib/i18n/client";

const initialState: SaveTemplateState = {};

export function TemplateUploadForm() {
  const router = useRouter();
  const [resetKey, setResetKey] = useState(0);

  return (
    <FormInstance
      key={resetKey}
      onReset={() => setResetKey((k) => k + 1)}
      onDone={() => router.push("/documents")}
    />
  );
}

function FormInstance({
  onReset,
  onDone,
}: {
  onReset: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const [state, formAction, isPending] = useActionState(
    saveTemplateAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      const tm = setTimeout(onDone, 800);
      return () => clearTimeout(tm);
    }
  }, [state.ok, onDone]);

  if (state.ok) {
    return (
      <div className="rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 p-4 text-sm text-green-800 dark:text-green-200 space-y-2">
        {t("upload.savedRedirect")}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            className="text-xs rounded-md border border-green-700 px-3 py-1"
          >
            {t("upload.addAnother")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field label={t("upload.name")} required>
        <input
          name="name"
          type="text"
          required
          maxLength={100}
          disabled={isPending}
          placeholder={t("upload.namePh2")}
          className="tpl-input"
        />
      </Field>

      <Field label={t("upload.description")}>
        <textarea
          name="description"
          rows={2}
          disabled={isPending}
          placeholder={t("upload.descriptionPh2")}
          className="tpl-input"
        />
      </Field>

      <Field label={t("upload.koFile2")} required>
        <input
          name="koFile"
          type="file"
          required
          disabled={isPending}
          className="block w-full text-sm border border-zinc-300 dark:border-zinc-700 rounded-md p-2 bg-white dark:bg-zinc-900"
        />
      </Field>

      <Field label={t("upload.enFile2")}>
        <input
          name="enFile"
          type="file"
          disabled={isPending}
          className="block w-full text-sm border border-zinc-300 dark:border-zinc-700 rounded-md p-2 bg-white dark:bg-zinc-900"
        />
      </Field>

      <p className="text-xs text-zinc-500">
        {t("upload.fileHint2Line1")}
        <br />
        {t("upload.fileHint2Line2")}
      </p>

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
          {isPending ? t("upload.submitting") : t("upload.saveBtn")}
        </button>
        <Link
          href="/documents"
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm"
        >
          {t("common.cancel")}
        </Link>
      </div>

      <style>{`
        .tpl-input {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgb(212 212 216);
          background: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(24 24 27);
        }
        .tpl-input:focus { outline: none; box-shadow: 0 0 0 2px rgb(113 113 122); }
        .tpl-input:disabled { opacity: 0.5; }
        @media (prefers-color-scheme: dark) {
          .tpl-input { border-color: rgb(63 63 70); background: rgb(9 9 11); color: rgb(244 244 245); }
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

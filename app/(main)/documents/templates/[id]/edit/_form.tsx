"use client";

/**
 * 양식 편집 폼 — 이름/설명 수정, 파일은 새로 첨부한 경우에만 교체.
 * 기존 파일을 유지하려면 파일 입력을 비워두면 됨.
 */

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateTemplateAction,
  type SaveTemplateState,
} from "../../../template-actions";
import { maybeCompressImage } from "../../../_image-compress";
import { useT } from "@/lib/i18n/client";

const initialState: SaveTemplateState = {};

export function TemplateEditForm({
  template,
}: {
  template: {
    id: string;
    name: string;
    description: string;
    koFileName: string;
    enFileName: string | null;
  };
}) {
  const t = useT();
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    updateTemplateAction,
    initialState,
  );

  // 제출 직전 이미지 파일을 클라이언트에서 축소한 뒤 서버 액션 호출
  const handleSubmit = async (formData: FormData) => {
    for (const field of ["koFile", "enFile"]) {
      const f = formData.get(field);
      if (f instanceof File && f.size > 0) {
        formData.set(field, await maybeCompressImage(f), f.name);
      }
    }
    formAction(formData);
  };

  useEffect(() => {
    if (state.ok) {
      const tm = setTimeout(() => {
        router.push("/documents");
        router.refresh();
      }, 800);
      return () => clearTimeout(tm);
    }
  }, [state.ok, router]);

  if (state.ok) {
    return (
      <div className="rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 p-4 text-sm text-green-800 dark:text-green-200">
        {t("upload.savedRedirect")}
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <input type="hidden" name="templateId" value={template.id} />

      <Field label={t("upload.name")} required>
        <input
          name="name"
          type="text"
          required
          maxLength={100}
          disabled={isPending}
          defaultValue={template.name}
          className="tpl-input"
        />
      </Field>

      <Field label={t("upload.description")}>
        <textarea
          name="description"
          rows={2}
          disabled={isPending}
          defaultValue={template.description}
          className="tpl-input"
        />
      </Field>

      <Field label={`${t("upload.koFile2")} — ${t("tpl.currentFile")}: ${template.koFileName}`}>
        <input
          name="koFile"
          type="file"
          disabled={isPending}
          className="block w-full text-sm border border-zinc-300 dark:border-zinc-700 rounded-md p-2 bg-white dark:bg-zinc-900"
        />
      </Field>

      <Field
        label={
          template.enFileName
            ? `${t("upload.enFile2")} — ${t("tpl.currentFile")}: ${template.enFileName}`
            : t("upload.enFile2")
        }
      >
        <input
          name="enFile"
          type="file"
          disabled={isPending}
          className="block w-full text-sm border border-zinc-300 dark:border-zinc-700 rounded-md p-2 bg-white dark:bg-zinc-900"
        />
      </Field>

      <p className="text-xs text-zinc-500">{t("tpl.editFileHint")}</p>

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
          {isPending ? t("upload.submitting") : t("common.save")}
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

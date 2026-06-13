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

/**
 * 이미지 파일을 클라이언트에서 축소(긴 변 2200px, JPEG 0.85)해 업로드 용량을 줄인다.
 * - 폰 사진(수 MB)이 서버 액션 본문 제한·플랫폼 한도를 넘지 않도록.
 * - 이미지가 아니거나(또는 압축 실패/효과 없음) PDF·HWP 등은 원본 그대로 반환.
 */
async function maybeCompressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // GIF(애니메이션)·SVG는 캔버스 변환이 부적절 — 원본 유지
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 2200;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
    );
    bitmap.close?.();
    if (!blob || blob.size >= file.size) return file; // 효과 없으면 원본
    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file; // HEIC 등 디코드 실패 시 원본 (서버 액션 20MB 한도가 받쳐줌)
  }
}

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
    <form action={handleSubmit} className="space-y-4">
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

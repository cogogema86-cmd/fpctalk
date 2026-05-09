"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadDocumentAction, type UploadState } from "../actions";

const initialState: UploadState = {};

type Candidate = {
  id: string;
  name: string;
  username: string;
  roleLabel: string;
};

export function UploadForm({ candidates }: { candidates: Candidate[] }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    uploadDocumentAction,
    initialState,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (state.documentId) {
      router.push(`/documents/${state.documentId}`);
      router.refresh();
    }
  }, [state.documentId, router]);

  const toggleAll = () => {
    if (selected.size === candidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(candidates.map((c) => c.id)));
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <form action={formAction} className="space-y-4">
      <Field label="PDF 파일" required>
        <input
          name="file"
          type="file"
          accept="application/pdf"
          required
          disabled={isPending}
          className="block w-full text-sm border border-zinc-300 dark:border-zinc-700 rounded-md p-2 bg-white dark:bg-zinc-900"
        />
        <p className="mt-1 text-xs text-zinc-500">최대 10MB · PDF만</p>
      </Field>

      <Field label="제목" required>
        <input
          name="title"
          type="text"
          required
          disabled={isPending}
          placeholder="예: 2026 여름방학 직원 휴가 동의서"
          className="upload-input"
        />
      </Field>

      <Field label="설명 (선택)">
        <textarea
          name="description"
          rows={2}
          disabled={isPending}
          placeholder="간단한 설명"
          className="upload-input"
        />
      </Field>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            사인 받을 대상 (선택됨 {selected.size}명)
            <span className="text-red-500 ml-0.5">*</span>
          </label>
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {selected.size === candidates.length ? "전체 해제" : "전체 선택"}
          </button>
        </div>
        <div className="rounded-md border border-zinc-200 dark:border-zinc-800 max-h-64 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900">
          {candidates.length === 0 && (
            <div className="px-4 py-6 text-sm text-zinc-500 text-center">
              다른 직원이 없습니다. 먼저 직원을 추가하세요.
            </div>
          )}
          {candidates.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <input
                type="checkbox"
                name="signerIds"
                value={c.id}
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                disabled={isPending}
              />
              <div className="flex-1 text-sm">
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-zinc-500">
                  {c.username} · {c.roleLabel}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {state.error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {state.error}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={isPending || selected.size === 0}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
        >
          {isPending ? "업로드 중..." : "업로드 + 사인 요청"}
        </button>
        <Link
          href="/documents"
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm"
        >
          취소
        </Link>
      </div>

      <style>{`
        .upload-input {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgb(212 212 216);
          background: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(24 24 27);
        }
        .upload-input:focus { outline: none; box-shadow: 0 0 0 2px rgb(113 113 122); }
        .upload-input:disabled { opacity: 0.5; }
        @media (prefers-color-scheme: dark) {
          .upload-input { border-color: rgb(63 63 70); background: rgb(9 9 11); color: rgb(244 244 245); }
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

"use client";

import { useActionState, useState, useTransition } from "react";
import {
  deleteTemplateAction,
  requestSignaturesAction,
  saveTemplateAction,
  type SaveTemplateState,
} from "./template-actions";

type Template = {
  id: string;
  name: string;
  description: string | null;
  koFileName: string;
  enFileName: string | null;
  createdAt: string;
};

const initialState: SaveTemplateState = {};

export function TemplatesSection({ templates }: { templates: Template[] }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">📁 양식 보관함</h2>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="text-xs rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 font-medium"
        >
          {showForm ? "닫기" : "+ 새 양식"}
        </button>
      </div>

      {showForm && <UploadForm onClose={() => setShowForm(false)} />}

      {templates.length === 0 ? (
        <div className="text-xs text-zinc-500 text-center py-3">
          저장된 양식이 없습니다. "+ 새 양식"을 눌러 추가하세요.
        </div>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <TemplateRow key={t.id} template={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadForm({ onClose }: { onClose: () => void }) {
  const [resetKey, setResetKey] = useState(0);
  return (
    <UploadFormInstance
      key={resetKey}
      onClose={onClose}
      onReset={() => setResetKey((k) => k + 1)}
    />
  );
}

function UploadFormInstance({
  onClose,
  onReset,
}: {
  onClose: () => void;
  onReset: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    saveTemplateAction,
    initialState,
  );

  if (state.ok) {
    return (
      <div className="rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 p-3 text-sm text-green-800 dark:text-green-200 space-y-2">
        ✅ 양식이 저장되었습니다.
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            className="text-xs rounded-md border border-green-700 px-3 py-1"
          >
            계속 추가
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs rounded-md bg-green-700 text-white px-3 py-1"
          >
            닫기
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-3"
    >
      <div>
        <label className="block text-xs font-medium mb-1">
          양식 이름 <span className="text-red-500">*</span>
        </label>
        <input
          name="name"
          type="text"
          required
          maxLength={100}
          disabled={isPending}
          placeholder="예: 2026 연차휴가신청서"
          className="tpl-input"
        />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">설명 (선택)</label>
        <input
          name="description"
          type="text"
          disabled={isPending}
          placeholder="간단한 설명"
          className="tpl-input"
        />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">
          🇰🇷 한국어 파일 <span className="text-red-500">*</span>
        </label>
        <input
          name="koFile"
          type="file"
          required
          disabled={isPending}
          className="block w-full text-xs border border-zinc-300 dark:border-zinc-700 rounded-md p-1.5 bg-white dark:bg-zinc-950"
        />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">
          🇺🇸 English file (선택)
        </label>
        <input
          name="enFile"
          type="file"
          disabled={isPending}
          className="block w-full text-xs border border-zinc-300 dark:border-zinc-700 rounded-md p-1.5 bg-white dark:bg-zinc-950"
        />
      </div>

      <p className="text-[10px] text-zinc-500">
        PDF / HWP / DOCX / XLSX / 이미지 등 모든 포맷 가능 (각 파일 최대 20MB)
      </p>

      {state.error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {state.error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="text-xs rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 font-medium disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="text-xs rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5"
        >
          취소
        </button>
      </div>

      <style>{`
        .tpl-input {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgb(212 212 216);
          background: white;
          padding: 0.4rem 0.6rem;
          font-size: 0.8125rem;
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

function TemplateRow({ template }: { template: Template }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ count: number } | null>(null);

  const handleRequestSignatures = () => {
    if (
      !confirm(
        `"${template.name}" 양식으로 본인을 제외한 모든 직원에게 사인을 요청하시겠습니까?`,
      )
    )
      return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const r = await requestSignaturesAction(template.id);
      if (r.error) setError(r.error);
      else if (r.signersCount !== undefined)
        setSuccess({ count: r.signersCount });
    });
  };

  const handleDelete = () => {
    if (!confirm(`"${template.name}" 양식을 삭제하시겠습니까?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteTemplateAction(template.id);
      if (r.error) setError(r.error);
    });
  };

  return (
    <li className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm">{template.name}</div>
          {template.description && (
            <div className="text-xs text-zinc-500 mt-0.5">
              {template.description}
            </div>
          )}
          <div className="text-[10px] text-zinc-400 mt-1 space-x-2">
            <span>🇰🇷 {template.koFileName}</span>
            {template.enFileName && <span>🇺🇸 {template.enFileName}</span>}
            {!template.enFileName && (
              <span className="text-zinc-300">🇺🇸 영어 파일 없음</span>
            )}
          </div>
        </div>
      </div>

      {success ? (
        <div className="rounded-md bg-green-50 dark:bg-green-950/40 px-3 py-2 text-xs text-green-800 dark:text-green-200">
          ✅ {success.count}명에게 사인 요청을 보냈습니다.{" "}
          <a href="/documents" className="underline">
            진행 상황 보기
          </a>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleRequestSignatures}
            disabled={isPending}
            className="text-xs rounded-md bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 font-medium disabled:opacity-50"
          >
            {isPending ? "처리 중..." : "✍️ 전 직원 사인 요청"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="text-xs rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            삭제
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
    </li>
  );
}

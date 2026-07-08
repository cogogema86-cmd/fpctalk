"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  requestSignaturesFromTemplateAction,
  type RequestSignaturesState,
} from "../../../template-actions";

const initialState: RequestSignaturesState = {};

type Candidate = {
  id: string;
  name: string;
  username: string;
  roleLabel: string;
};

type ExternalSigner = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

export function RequestSignaturesForm({
  templateId,
  candidates,
}: {
  templateId: string;
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    requestSignaturesFromTemplateAction,
    initialState,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 직원 목록 접기 — 직원이 많으면 지저분해서 기본은 접힌 상태
  const [staffOpen, setStaffOpen] = useState(false);
  const [externals, setExternals] = useState<ExternalSigner[]>([]);
  const [extName, setExtName] = useState("");
  const [extContact, setExtContact] = useState("");

  useEffect(() => {
    if (state.campaignId) {
      router.push(`/documents/${state.campaignId}`);
      router.refresh();
    }
  }, [state.campaignId, router]);

  const toggleAll = () => {
    if (selected.size === candidates.length) setSelected(new Set());
    else setSelected(new Set(candidates.map((c) => c.id)));
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addExternal = () => {
    const name = extName.trim();
    if (!name) return;
    const isEmail = extContact.includes("@");
    setExternals((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        email: isEmail ? extContact.trim() : "",
        phone: !isEmail ? extContact.trim() : "",
      },
    ]);
    setExtName("");
    setExtContact("");
  };

  const removeExternal = (id: string) => {
    setExternals((prev) => prev.filter((e) => e.id !== id));
  };

  const totalCount = selected.size + externals.length;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="templateId" value={templateId} />

      {/* 직원 — 기본 접힘 (목록이 길어지면 지저분해서). 접혀 있어도 선택 상태는 유지됨 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => setStaffOpen((o) => !o)}
            aria-expanded={staffOpen}
            className="flex items-center gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <span
              className={`inline-block transition-transform text-xs text-zinc-400 ${staffOpen ? "rotate-90" : ""}`}
            >
              ▶
            </span>
            🧑‍💼 직원 (선택됨 {selected.size}명)
          </button>
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {selected.size === candidates.length ? "전체 해제" : "전체 선택"}
          </button>
        </div>
        {/* 접힘 = display:none — 체크박스가 DOM에 남아 있어야 폼 제출에 포함됨 */}
        <div
          className={`rounded-md border border-zinc-200 dark:border-zinc-800 max-h-64 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900 ${staffOpen ? "" : "hidden"}`}
        >
          {candidates.length === 0 && (
            <div className="px-4 py-4 text-sm text-zinc-500 text-center">
              직원이 없습니다.
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

      {/* 외부 사인자 */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          👨‍👩‍👧 외부 사인자 (학부모 등, 선택됨 {externals.length}명)
        </label>
        <p className="text-xs text-zinc-500 mb-2">
          로그인 없이 링크 한 번에 사인 가능. 추가 후 진행 페이지에서 링크 복사 → 카톡/문자로 전달.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 mb-2">
          <input
            type="text"
            placeholder="이름 (예: 홍길동 학부모)"
            value={extName}
            onChange={(e) => setExtName(e.target.value)}
            disabled={isPending}
            className="ext-input"
          />
          <input
            type="text"
            placeholder="이메일 또는 전화 (선택)"
            value={extContact}
            onChange={(e) => setExtContact(e.target.value)}
            disabled={isPending}
            className="ext-input"
          />
          <button
            type="button"
            onClick={addExternal}
            disabled={isPending || !extName.trim()}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
          >
            + 추가
          </button>
        </div>

        {externals.length > 0 && (
          <ul className="rounded-md border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-900">
            {externals.map((e) => (
              <li
                key={e.id}
                className="px-4 py-2 flex items-center justify-between gap-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-zinc-500">
                    {e.email || e.phone || "—"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeExternal(e.id)}
                  disabled={isPending}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline shrink-0"
                >
                  제거
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          type="hidden"
          name="externals"
          value={JSON.stringify(
            externals.map((e) => ({
              name: e.name,
              email: e.email,
              phone: e.phone,
            })),
          )}
        />
      </div>

      {state.error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {state.error}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={isPending || totalCount === 0}
          className="rounded-md bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {isPending
            ? "전송 중..."
            : `사인 요청 보내기 (총 ${totalCount}명)`}
        </button>
        <Link
          href={`/documents/templates/${templateId}`}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm"
        >
          취소
        </Link>
      </div>

      <style>{`
        .ext-input {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgb(212 212 216);
          background: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(24 24 27);
        }
        .ext-input:focus { outline: none; box-shadow: 0 0 0 2px rgb(113 113 122); }
        .ext-input:disabled { opacity: 0.5; }
        @media (prefers-color-scheme: dark) {
          .ext-input { border-color: rgb(63 63 70); background: rgb(9 9 11); color: rgb(244 244 245); }
        }
      `}</style>
    </form>
  );
}

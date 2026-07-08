"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addExternalContactAction,
  deleteExternalContactAction,
  requestSignaturesFromTemplateAction,
  type ExternalContactView,
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
  initialFavorites,
}: {
  templateId: string;
  candidates: Candidate[];
  /** 외부 사인자 즐겨찾기 (학원 공용 주소록) */
  initialFavorites: ExternalContactView[];
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

  // ── 즐겨찾기 (학원 공용 주소록) ──
  const [favorites, setFavorites] =
    useState<ExternalContactView[]>(initialFavorites);
  const [favOpen, setFavOpen] = useState(false);
  const [favChecked, setFavChecked] = useState<Set<string>>(new Set());
  const [favSavingId, setFavSavingId] = useState<string | null>(null);

  const isAdded = (p: { name: string; email: string; phone: string }) =>
    externals.some(
      (e) => e.name === p.name && e.email === p.email && e.phone === p.phone,
    );
  const isFavorite = (p: { name: string; email: string; phone: string }) =>
    favorites.some(
      (f) => f.name === p.name && f.email === p.email && f.phone === p.phone,
    );

  const toggleFavCheck = (id: string) => {
    setFavChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 체크한 즐겨찾기를 외부 사인자 목록에 한 번에 추가
  const addCheckedFavorites = () => {
    const picked = favorites.filter(
      (f) => favChecked.has(f.id) && !isAdded(f),
    );
    setExternals((prev) => [
      ...prev,
      ...picked.map((f) => ({
        id: `${Date.now()}-${f.id.slice(-4)}-${Math.random().toString(36).slice(2, 6)}`,
        name: f.name,
        email: f.email,
        phone: f.phone,
      })),
    ]);
    setFavChecked(new Set());
  };

  // 요청 목록의 사람을 즐겨찾기에 저장
  const saveToFavorites = async (e: ExternalSigner) => {
    setFavSavingId(e.id);
    try {
      const r = await addExternalContactAction({
        name: e.name,
        email: e.email,
        phone: e.phone,
      });
      if (r.ok && !favorites.some((f) => f.id === r.contact.id)) {
        setFavorites((prev) =>
          [...prev, r.contact].sort((a, b) => a.name.localeCompare(b.name, "ko")),
        );
      }
    } finally {
      setFavSavingId(null);
    }
  };

  const deleteFavorite = async (id: string) => {
    setFavorites((prev) => prev.filter((f) => f.id !== id));
    setFavChecked((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await deleteExternalContactAction(id);
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
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            👨‍👩‍👧 외부 사인자 (학부모 등, 선택됨 {externals.length}명)
          </label>
          <button
            type="button"
            onClick={() => setFavOpen((o) => !o)}
            aria-expanded={favOpen}
            className={`text-xs rounded-md border px-2.5 py-1 ${
              favOpen
                ? "border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200"
                : "border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            }`}
          >
            ⭐ 즐겨찾기{favorites.length > 0 ? ` (${favorites.length})` : ""}
          </button>
        </div>
        <p className="text-xs text-zinc-500 mb-2">
          로그인 없이 링크 한 번에 사인 가능. 전화번호를 입력하면 사인 링크가 문자로 자동 발송됩니다.
        </p>

        {/* 즐겨찾기 패널 — 체크박스로 여러 명 한 번에 추가 */}
        {favOpen && (
          <div className="mb-2 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2">
            {favorites.length === 0 ? (
              <p className="text-xs text-zinc-500">
                즐겨찾기가 비어 있습니다. 아래에서 사람을 추가한 뒤 이름 옆의{" "}
                <span className="font-medium">☆ 저장</span> 버튼을 누르면
                다음부터 여기에서 바로 선택할 수 있습니다.
              </p>
            ) : (
              <>
                <div className="max-h-48 overflow-y-auto divide-y divide-amber-100 dark:divide-amber-950 rounded-md border border-amber-200 dark:border-amber-900 bg-white dark:bg-zinc-950">
                  {favorites.map((f) => {
                    const added = isAdded(f);
                    return (
                      <div
                        key={f.id}
                        className="flex items-center gap-3 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={favChecked.has(f.id)}
                          onChange={() => toggleFavCheck(f.id)}
                          disabled={isPending || added}
                        />
                        <button
                          type="button"
                          onClick={() => !added && toggleFavCheck(f.id)}
                          disabled={isPending || added}
                          className="flex-1 min-w-0 text-left"
                        >
                          <span className="font-medium">{f.name}</span>{" "}
                          <span className="text-xs text-zinc-500">
                            {f.phone || f.email || "—"}
                            {added && " · ✓ 추가됨"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteFavorite(f.id)}
                          disabled={isPending}
                          title="즐겨찾기에서 삭제"
                          className="text-xs text-red-500/70 hover:text-red-600 hover:underline shrink-0"
                        >
                          삭제
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={addCheckedFavorites}
                  disabled={isPending || favChecked.size === 0}
                  className="rounded-md bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  체크한 {favChecked.size}명 추가
                </button>
              </>
            )}
          </div>
        )}

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
            {externals.map((e) => {
              const saved = isFavorite(e);
              return (
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
                  {/* 즐겨찾기 저장 — 다음부터 체크박스로 바로 선택 */}
                  <button
                    type="button"
                    onClick={() => saveToFavorites(e)}
                    disabled={isPending || saved || favSavingId === e.id}
                    title={saved ? "즐겨찾기에 저장됨" : "즐겨찾기에 저장"}
                    className={`text-xs shrink-0 ${
                      saved
                        ? "text-amber-500 cursor-default"
                        : "text-zinc-400 hover:text-amber-500 hover:underline"
                    }`}
                  >
                    {saved
                      ? "⭐ 저장됨"
                      : favSavingId === e.id
                        ? "저장 중..."
                        : "☆ 저장"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeExternal(e.id)}
                    disabled={isPending}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline shrink-0"
                  >
                    제거
                  </button>
                </li>
              );
            })}
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

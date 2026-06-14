"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InfraService } from "@/lib/infra-info";
import { saveInfraInventoryAction } from "./actions";

// 편집용 행 — 중첩 배열(식별자·환경변수)은 textarea 문자열로 다룬다.
type Row = {
  name: string;
  icon: string;
  purpose: string;
  loginUrl: string;
  secretNote: string;
  identifiersText: string; // "라벨: 값" 한 줄씩
  envVarsText: string; // 한 줄씩
};

function toRow(s: InfraService): Row {
  return {
    name: s.name,
    icon: s.icon,
    purpose: s.purpose,
    loginUrl: s.loginUrl,
    secretNote: s.secretNote ?? "",
    identifiersText: s.identifiers
      .map((i) => `${i.label}: ${i.value}`)
      .join("\n"),
    envVarsText: s.envVars.join("\n"),
  };
}

function toService(r: Row): InfraService {
  const identifiers = r.identifiersText
    .split("\n")
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return { label: line.trim(), value: "" };
      return {
        label: line.slice(0, idx).trim(),
        value: line.slice(idx + 1).trim(),
      };
    })
    .filter((i) => i.label || i.value);
  const envVars = r.envVarsText
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
  return {
    name: r.name.trim(),
    icon: r.icon.trim(),
    purpose: r.purpose.trim(),
    loginUrl: r.loginUrl.trim(),
    identifiers,
    envVars,
    secretNote: r.secretNote.trim() || undefined,
  };
}

const EMPTY: Row = {
  name: "",
  icon: "🔧",
  purpose: "",
  loginUrl: "",
  secretNote: "",
  identifiersText: "",
  envVarsText: "",
};

export function InfraEditor({ initial }: { initial: InfraService[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial.map(toRow));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) =>
    setRows((rs) => rs.filter((_, j) => j !== i));
  const add = () => setRows((rs) => [...rs, { ...EMPTY }]);
  const moveUp = (i: number) =>
    setRows((rs) => {
      if (i === 0) return rs;
      const c = [...rs];
      [c[i - 1], c[i]] = [c[i], c[i - 1]];
      return c;
    });

  const save = () => {
    setMsg(null);
    const services = rows.map(toService).filter((s) => s.name);
    startTransition(async () => {
      const r = await saveInfraInventoryAction(services);
      if (!r.ok) {
        setMsg({ ok: false, text: r.error ?? "저장 실패" });
        return;
      }
      setMsg({ ok: true, text: "✅ 저장됨 — 대시보드에 즉시 반영됩니다." });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {rows.map((r, i) => (
        <div
          key={i}
          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-400">서비스 #{i + 1}</span>
            <div className="flex items-center gap-2">
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => moveUp(i)}
                  disabled={isPending}
                  className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  ↑ 위로
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={isPending}
                className="text-xs text-red-600 dark:text-red-400 hover:underline"
              >
                삭제
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[5rem_1fr] gap-2">
            <Field label="아이콘">
              <input
                value={r.icon}
                onChange={(e) => update(i, { icon: e.target.value })}
                disabled={isPending}
                className="infra-input text-center"
                placeholder="🔧"
              />
            </Field>
            <Field label="서비스명">
              <input
                value={r.name}
                onChange={(e) => update(i, { name: e.target.value })}
                disabled={isPending}
                className="infra-input"
                placeholder="예: Supabase"
              />
            </Field>
          </div>

          <Field label="용도">
            <input
              value={r.purpose}
              onChange={(e) => update(i, { purpose: e.target.value })}
              disabled={isPending}
              className="infra-input"
              placeholder="예: 데이터베이스 · 로그인"
            />
          </Field>

          <Field label="로그인 URL (https://)">
            <input
              value={r.loginUrl}
              onChange={(e) => update(i, { loginUrl: e.target.value })}
              disabled={isPending}
              className="infra-input"
              placeholder="https://..."
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="식별자 (한 줄에 '라벨: 값')">
              <textarea
                value={r.identifiersText}
                onChange={(e) =>
                  update(i, { identifiersText: e.target.value })
                }
                disabled={isPending}
                rows={3}
                className="infra-input font-mono text-xs"
                placeholder={"프로젝트 ref: abc123\n버킷: fpctalk"}
              />
            </Field>
            <Field label="환경변수 이름 (한 줄에 하나, 값 X)">
              <textarea
                value={r.envVarsText}
                onChange={(e) => update(i, { envVarsText: e.target.value })}
                disabled={isPending}
                rows={3}
                className="infra-input font-mono text-xs"
                placeholder={"R2_ACCOUNT_ID\nR2_SECRET_ACCESS_KEY 🔒"}
              />
            </Field>
          </div>

          <Field label="비밀값 보관 위치 메모 (선택)">
            <input
              value={r.secretNote}
              onChange={(e) => update(i, { secretNote: e.target.value })}
              disabled={isPending}
              className="infra-input"
              placeholder="예: 키는 비밀번호 관리자(Bitwarden) 보관"
            />
          </Field>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        disabled={isPending}
        className="w-full rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 py-2.5 text-sm text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900"
      >
        + 서비스 추가
      </button>

      <div className="flex items-center gap-3 sticky bottom-0 bg-white/90 dark:bg-black/90 backdrop-blur py-3 -mx-1 px-1 border-t border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-5 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
        {msg && (
          <span
            className={`text-sm ${
              msg.ok
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {msg.text}
          </span>
        )}
      </div>

      <style>{`
        .infra-input {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgb(212 212 216);
          background: white;
          padding: 0.4rem 0.6rem;
          font-size: 0.875rem;
          color: rgb(24 24 27);
        }
        .infra-input:focus { outline: none; box-shadow: 0 0 0 2px rgb(113 113 122); }
        .infra-input:disabled { opacity: 0.5; }
        @media (prefers-color-scheme: dark) {
          .infra-input { border-color: rgb(63 63 70); background: rgb(9 9 11); color: rgb(244 244 245); }
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAiModelsAction, testAiModelAction } from "./actions";

// 흔히 쓰는 제미나이 모델명 추천 (자유 입력 + datalist 제안)
const SUGGESTIONS = [
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
];

type TestState = { ok: boolean; sample?: string; error?: string } | null;

export function AiSettingsForm({
  initialFast,
  initialPro,
  defaultModel,
}: {
  initialFast: string;
  initialPro: string;
  defaultModel: string;
}) {
  const router = useRouter();
  const [fast, setFast] = useState(initialFast);
  const [pro, setPro] = useState(initialPro);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  const [testFast, setTestFast] = useState<TestState>(null);
  const [testPro, setTestPro] = useState<TestState>(null);
  const [testingFast, startTestFast] = useTransition();
  const [testingPro, startTestPro] = useTransition();

  const save = () => {
    setSaved(false);
    setSaveErr(null);
    startSave(async () => {
      const r = await setAiModelsAction(fast, pro);
      if (!r.ok) {
        setSaveErr(r.error ?? "저장 실패");
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 3000);
    });
  };

  return (
    <div className="space-y-5">
      <datalist id="gemini-models">
        {SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <ModelField
        label="⚡ 빠른 모델 (Fast)"
        value={fast}
        onChange={setFast}
        defaultModel={defaultModel}
        test={testFast}
        testing={testingFast}
        onTest={() => {
          setTestFast(null);
          startTestFast(async () => setTestFast(await testAiModelAction(fast)));
        }}
      />

      <ModelField
        label="🎯 정밀 모델 (Pro)"
        value={pro}
        onChange={setPro}
        defaultModel={defaultModel}
        test={testPro}
        testing={testingPro}
        onTest={() => {
          setTestPro(null);
          startTestPro(async () => setTestPro(await testAiModelAction(pro)));
        }}
      />

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={isSaving}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-5 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
        >
          {isSaving ? "저장 중..." : "저장 (즉시 반영)"}
        </button>
        {saved && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400">
            ✅ 저장됨 — 다음 AI 응답부터 적용
          </span>
        )}
        {saveErr && (
          <span className="text-sm text-red-600 dark:text-red-400">
            {saveErr}
          </span>
        )}
      </div>
    </div>
  );
}

function ModelField({
  label,
  value,
  onChange,
  defaultModel,
  test,
  testing,
  onTest,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  defaultModel: string;
  test: TestState;
  testing: boolean;
  onTest: () => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          list="gemini-models"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={defaultModel}
          className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-500"
        />
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          className="shrink-0 rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          {testing ? "테스트 중..." : "연결 테스트"}
        </button>
      </div>
      {test && (
        <div
          className={`mt-1.5 text-xs ${
            test.ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {test.ok
            ? `✅ 정상 작동 (응답: "${test.sample}")`
            : `❌ 오류: ${test.error}`}
        </div>
      )}
    </div>
  );
}

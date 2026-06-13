"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setAiModelsAction,
  testAiModelAction,
  listGeminiModelsAction,
} from "./actions";

type TestState = { ok: boolean; sample?: string; error?: string } | null;
type Model = { id: string; label: string };

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

  // 구글에서 실시간으로 받아온 사용 가능 모델 목록
  const [models, setModels] = useState<Model[]>([]);
  const [listErr, setListErr] = useState<string | null>(null);
  const [loadingList, startLoadList] = useTransition();

  const loadModels = () => {
    setListErr(null);
    startLoadList(async () => {
      const r = await listGeminiModelsAction();
      if (!r.ok) {
        setListErr(r.error ?? "목록 조회 실패");
        setModels([]);
        return;
      }
      setModels(r.models ?? []);
    });
  };

  // 화면 진입 시 자동 1회 조회
  useEffect(() => {
    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {/* 실시간 모델 목록 상태 */}
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={loadModels}
          disabled={loadingList}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          {loadingList ? "불러오는 중..." : "🔄 모델 목록 새로고침"}
        </button>
        {!loadingList && !listErr && (
          <span className="text-zinc-500">
            구글에서 받아온 사용 가능 모델 {models.length}개
          </span>
        )}
        {listErr && (
          <span className="text-red-600 dark:text-red-400">⚠ {listErr}</span>
        )}
      </div>

      <ModelField
        label="⚡ 빠른 모델 (Fast)"
        value={fast}
        onChange={setFast}
        defaultModel={defaultModel}
        models={models}
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
        models={models}
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
  models,
  test,
  testing,
  onTest,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  defaultModel: string;
  models: Model[];
  test: TestState;
  testing: boolean;
  onTest: () => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2 flex-wrap">
        {/* 실시간 목록에서 선택 */}
        <select
          value={models.some((m) => m.id === value) ? value : ""}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          disabled={models.length === 0}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-2 text-sm max-w-[55%] disabled:opacity-50"
        >
          <option value="">
            {models.length ? "목록에서 선택…" : "목록 불러오는 중…"}
          </option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          className="shrink-0 rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          {testing ? "테스트 중..." : "연결 테스트"}
        </button>
      </div>
      {/* 직접 입력 (새 모델이 목록에 아직 없을 때) */}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={defaultModel}
        className="mt-2 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-500"
      />
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

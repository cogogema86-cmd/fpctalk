export default function AssistantPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          AI 비서
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          일정 확인, 보고서 작성, 학원 데이터 조회까지 — 학원 비서 전담 AI
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-6 bg-zinc-50 dark:bg-zinc-950">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-2">
          🚧 STEP 6에서 구현 예정
        </div>
        <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1.5">
          <li>• 🟢 Flash 모델 (일상 대화) / 🔵 Pro 모델 (업무) 자동 라우팅</li>
          <li>• 학원 데이터 조회 (출근자, 일정, 학생 정보)</li>
          <li>• 보고서 / 공지문 / 회의록 작성 보조</li>
          <li>• 채팅 안에서도 호출 가능 (`/ai 질문`)</li>
        </ul>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Placeholder
      title="채팅"
      description="실시간 메신저 + AI비서 호출"
      step="STEP 5"
      features={[
        "1:1 / 그룹 채팅방",
        "Supabase Realtime 기반 실시간 수신",
        "이모지 / 파일 / 이미지 첨부",
        "/ai 명령어로 AI 비서 호출",
        "/pro 명령어로 고성능 모델 강제",
        "메시지 검색",
      ]}
    />
  );
}

function Placeholder({
  title,
  description,
  step,
  features,
}: {
  title: string;
  description: string;
  step: string;
  features: string[];
}) {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-6 bg-zinc-50 dark:bg-zinc-950">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-2">
          🚧 {step}에서 구현 예정
        </div>
        <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1.5">
          {features.map((f) => (
            <li key={f} className="flex gap-2">
              <span className="text-zinc-400">•</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

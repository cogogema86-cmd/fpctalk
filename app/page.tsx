export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-black p-8">
      <main className="max-w-xl text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          FPCTalk
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Francis Parker 학원 직원용 메신저 + AI 비서
        </p>
        <div className="text-sm text-zinc-500 dark:text-zinc-500 pt-4 border-t border-zinc-200 dark:border-zinc-800">
          🚧 셋업 진행 중 — 이 화면이 보이면 Next.js + Tailwind는 정상 동작
        </div>
      </main>
    </div>
  );
}

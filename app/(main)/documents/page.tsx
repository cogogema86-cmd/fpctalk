export default function DocumentsPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          문서 + 사인
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          PDF 업로드 → 직원에게 사인 요청 → 합성된 PDF 보관
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-6 bg-zinc-50 dark:bg-zinc-950">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-2">
          🚧 STEP 8에서 구현 예정
        </div>
        <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1.5">
          <li>• PDF/이미지 문서 업로드 (Supabase Storage)</li>
          <li>• 사인 위치 지정 + 직원에게 요청</li>
          <li>• 직원: 캔버스에 손글씨 사인 → 자동 합성</li>
          <li>• 법적 효력: 시간 / IP / 기기정보 감사 로그</li>
          <li>• 완성 PDF 다운로드 / 보관</li>
        </ul>
      </div>
    </div>
  );
}

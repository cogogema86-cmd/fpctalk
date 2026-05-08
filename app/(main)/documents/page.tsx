export default function DocumentsPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          문서 + 사인
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          학원이 받아야 하는 각종 동의서·안내장을 PDF로 일괄 받고 보관
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-6 bg-zinc-50 dark:bg-zinc-950">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-2">
          🚧 STEP 8에서 구현 예정
        </div>
        <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1.5">
          <li>
            • <strong>관리자가 PDF 업로드</strong> — 휴가 동의서, 현장학습 동의서, 각종 안내장 등
          </li>
          <li>
            • <strong>대상자 일괄 지정</strong> — 직원 전체 / 강사만 / 특정 직원 / 학부모(외부 링크) 등
          </li>
          <li>
            • <strong>대상자 손글씨 사인</strong> — 캔버스에 마우스/터치로 사인 그리기
          </li>
          <li>
            • <strong>PDF 자동 합성</strong> — 사인을 PDF에 합쳐서 완성본 생성
          </li>
          <li>
            • <strong>관리자 다운로드</strong> — 사인 완료된 PDF를 한 번에 받아서 보관
          </li>
          <li>
            • <strong>법적 효력 감사 로그</strong> — 누가 / 언제 / 어디서 사인했는지 기록 (시간·IP·기기)
          </li>
          <li>
            • <strong>진행 상황 추적</strong> — 누가 사인했고 누가 안 했는지 한눈에
          </li>
        </ul>
      </div>
      <div className="rounded-md bg-blue-50 dark:bg-blue-950/40 p-4 text-xs text-blue-800 dark:text-blue-200">
        💡 <strong>활용 예시</strong>: 여름방학 직원 휴가 동의서, 현장학습 학생
        동의서, 안전 교육 수료 확인서, 개인정보 수집 동의서 등 학원에서 정기적으로
        받아야 하는 모든 문서.
      </div>
    </div>
  );
}

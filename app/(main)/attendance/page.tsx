export default function AttendancePage() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          근태
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          출퇴근 체크 + 연차/휴가 신청 관리
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-6 bg-zinc-50 dark:bg-zinc-950">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-2">
          🚧 STEP 7에서 구현 예정
        </div>
        <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1.5">
          <li>• 출근/퇴근 한 번 클릭 체크</li>
          <li>• 옵션: GPS 위치 함께 기록</li>
          <li>• 캘린더 뷰 (월간 출퇴근 현황)</li>
          <li>• 연차/반차/병가 신청 → 원장 승인 워크플로우</li>
          <li>• 본인 사용/잔여 연차 일수 표시</li>
        </ul>
      </div>
    </div>
  );
}

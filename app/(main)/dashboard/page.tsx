import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const user = authUser
    ? await prisma.user.findUnique({
        where: { authId: authUser.id },
        select: { name: true, role: true, annualLeaveTotal: true, annualLeaveUsed: true },
      })
    : null;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          안녕하세요, {user?.name}님
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          오늘 학원에서 할 일을 확인하세요.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="오늘의 출근" value="—" hint="근태 메뉴에서 체크" />
        <Card
          title="남은 연차"
          value={
            user
              ? `${user.annualLeaveTotal - user.annualLeaveUsed}일`
              : "—"
          }
          hint={
            user
              ? `총 ${user.annualLeaveTotal}일 중 ${user.annualLeaveUsed}일 사용`
              : ""
          }
        />
        <Card title="대기 중인 사인" value="—" hint="문서 메뉴에서 확인" />
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 bg-zinc-50 dark:bg-zinc-950">
        <h2 className="font-semibold mb-2">🚧 개발 진행 상황</h2>
        <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
          <li>✅ STEP 1~2: 인프라 + 배포</li>
          <li>✅ STEP 3: 인증 (로그인/세션)</li>
          <li>✅ STEP 4: 메인 레이아웃 + 사이드바 (← 지금)</li>
          <li>⏭ STEP 5: 채팅 (실시간)</li>
          <li>⏭ STEP 6: AI 비서 통합</li>
          <li>⏭ STEP 7: 근태 + 연차</li>
          <li>⏭ STEP 8: 디지털 사인</li>
          <li>⏭ STEP 9: 도메인 연결</li>
        </ul>
      </div>
    </div>
  );
}

function Card({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-950">
      <div className="text-sm text-zinc-500 dark:text-zinc-400">{title}</div>
      <div className="text-2xl font-semibold mt-1 text-zinc-900 dark:text-zinc-50">
        {value}
      </div>
      {hint && (
        <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
          {hint}
        </div>
      )}
    </div>
  );
}

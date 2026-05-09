import Link from "next/link";
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
        include: { role: true },
      })
    : null;

  const isAdmin = !!user?.role.isAdmin;

  // 관리자에게만 표시하는 요약 카드용 데이터
  let pendingLeaveCount = 0;
  let totalUserCount = 0;
  if (isAdmin) {
    [pendingLeaveCount, totalUserCount] = await Promise.all([
      prisma.leaveRequest.count({ where: { status: "PENDING" } }),
      prisma.user.count(),
    ]);
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          안녕하세요, {user?.name}님
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {user?.role.label}
          {user?.title ? ` · ${user.title}` : ""} — 오늘도 학원 업무 화이팅!
        </p>
      </div>

      {isAdmin ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card
              title="등록 직원"
              value={`${totalUserCount}명`}
              hint="직원 관리에서 추가/편집"
              href="/admin/users"
            />
            <Card
              title="대기 중인 휴가 신청"
              value={
                pendingLeaveCount > 0 ? `${pendingLeaveCount}건` : "0건"
              }
              hint={
                pendingLeaveCount > 0
                  ? "승인 대기 중"
                  : "모두 처리됨"
              }
              href="/admin/leave"
              highlight={pendingLeaveCount > 0}
            />
            <Card
              title="대기 중인 사인 (예정)"
              value="—"
              hint="STEP 8에서 구현 예정"
            />
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 bg-white dark:bg-zinc-950 space-y-2">
          <h2 className="font-semibold">오늘 사용 가능한 메뉴</h2>
          <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1.5">
            <li>
              💬 <Link href="/chat" className="underline">채팅</Link> — 동료/관리자와 대화
            </li>
            <li>
              🤖 <Link href="/assistant" className="underline">AI 비서</Link> — 일정 정리, 공지문/안내문 초안 작성
            </li>
            <li>
              📄 <Link href="/documents" className="underline">문서</Link> — 동의서/안내장 사인 (STEP 8 예정)
            </li>
          </ul>
          <p className="text-xs text-zinc-400 mt-4">
            근태 / 연차 관련 안내는 관리자에게 문의해주세요.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 bg-zinc-50 dark:bg-zinc-950">
        <h2 className="font-semibold mb-2">🚧 개발 진행 상황</h2>
        <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
          <li>✅ STEP 1~2: 인프라 + 배포</li>
          <li>✅ STEP 3: 인증 + 직원/역할 관리</li>
          <li>✅ STEP 4: 메인 레이아웃 + 사이드바</li>
          <li>✅ STEP 5: 채팅 (실시간 1:1)</li>
          <li>✅ STEP 6: AI 비서</li>
          <li>✅ STEP 7: 근태 + 연차 (관리자 전용)</li>
          <li>✅ STEP 9: 도메인 fpctalk.com 연결</li>
          <li>⏭ STEP 8: 디지털 사인 (다음)</li>
        </ul>
      </div>
    </div>
  );
}

function Card({
  title,
  value,
  hint,
  href,
  highlight,
}: {
  title: string;
  value: string;
  hint?: string;
  href?: string;
  highlight?: boolean;
}) {
  const inner = (
    <div
      className={`rounded-lg border p-4 ${
        highlight
          ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40"
          : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
      } ${href ? "hover:shadow-sm transition-shadow" : ""}`}
    >
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
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

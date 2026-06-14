import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { getLocale, getT } from "@/lib/i18n/server";
import { getUpcomingEventsForUser } from "@/lib/events";
import { getUpcomingPersonalEvents } from "@/lib/personal-events";
import { UpcomingEvents } from "./_upcoming-events";
import { UpcomingPersonal } from "@/app/(main)/attendance/_upcoming-personal";
import { StorageCard } from "./_storage-card";

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
  if (!isAdmin) redirect("/chat");

  const t = await getT();
  const locale = await getLocale();

  let pendingLeaveCount = 0;
  let totalUserCount = 0;
  let pendingSignsCount = 0;
  if (user) {
    [pendingLeaveCount, totalUserCount, pendingSignsCount] = await Promise.all([
      prisma.leaveRequest.count({ where: { status: "PENDING" } }),
      prisma.user.count(),
      prisma.signatureRequest.count({
        where: { signerId: user.id, status: "PENDING" },
      }),
    ]);
  }

  const upcomingEvents = user ? await getUpcomingEventsForUser(user.id, 7) : [];
  const unackedCount = upcomingEvents.filter((e) => !e.acked).length;
  const upcomingPersonal = user ? await getUpcomingPersonalEvents(user.id, 7) : [];

  const unitCases = t("dashboard.unitCases");
  const unitPeople = t("dashboard.unitPeople");

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {t("dashboard.greeting")} {user?.name}
          {t("dashboard.greetingSuffix")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {user?.role.label}
          {user?.title ? ` · ${user.title}` : ""} — {t("dashboard.tagline")}
        </p>
      </div>

      {/* AI 비서 안내 — 미확인 행사가 있으면 강조 */}
      {unackedCount > 0 && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 flex items-start gap-3">
          <div className="text-2xl">🤖</div>
          <div className="flex-1 text-sm">
            <div className="font-semibold text-red-900 dark:text-red-100">
              {t("dashboard.unackedTitle")}
            </div>
            <div className="text-red-800 dark:text-red-200 mt-0.5">
              {t("dashboard.unackedBody1")} <strong>{unackedCount}</strong>
              {t("dashboard.unackedBody2")}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          title={t("dashboard.totalStaff")}
          value={`${totalUserCount}${unitPeople ? unitPeople : ""}`}
          hint={t("dashboard.totalStaffHint")}
          href="/admin/users"
        />
        <Card
          title={t("dashboard.pendingLeaves")}
          value={
            pendingLeaveCount > 0
              ? `${pendingLeaveCount}${unitCases}`
              : `0${unitCases}`
          }
          hint={
            pendingLeaveCount > 0
              ? t("dashboard.pendingLeavesWaiting")
              : t("dashboard.pendingLeavesAllDone")
          }
          href="/admin/leave"
          highlight={pendingLeaveCount > 0}
        />
        <Card
          title={t("dashboard.pendingSignsCard")}
          value={
            pendingSignsCount > 0
              ? `${pendingSignsCount}${unitCases}`
              : `0${unitCases}`
          }
          hint={
            pendingSignsCount > 0
              ? t("dashboard.pendingSignsHint")
              : t("dashboard.pendingSignsAllDone")
          }
          href="/documents"
          highlight={pendingSignsCount > 0}
        />
      </div>

      {/* 저장공간 사용량 — canViewStorage 권한(기본 원장만) */}
      {user?.role.canViewStorage && <StorageCard />}

      {/* D-7 행사 카드 */}
      <UpcomingEvents events={upcomingEvents} locale={locale} />

      {/* D-7 내 일정 (개인) */}
      <UpcomingPersonal events={upcomingPersonal} />
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

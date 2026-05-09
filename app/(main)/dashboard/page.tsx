import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n/server";

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

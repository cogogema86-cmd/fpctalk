import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { EditStaffForm } from "./_form";
import { LeaveAdjustPanel } from "./_leave-adjust-panel";

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { authId: authUser.id },
    include: { role: true },
  });
  const t = await getT();
  if (!me || !me.role.isAdmin || !me.role.canManageUsers) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        {t("common.adminOnly")}
      </div>
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  if (!target) notFound();

  const roles = await prisma.staffRole.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, label: true, isAdmin: true },
  });

  // 최근 조정 이력 (감사 로그)
  const adjustments = await prisma.leaveAdjustment.findMany({
    where: { userId: target.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { admin: { select: { name: true, username: true } } },
  });

  // 잔여 연차 (예약된 PENDING 휴가는 제외 — 표시용)
  const reserved = await prisma.leaveRequest.findMany({
    where: { requesterId: target.id, status: "PENDING" },
    select: { type: true, startDate: true, endDate: true },
  });
  const reservedDays = reserved.reduce((sum, r) => {
    if (r.type === "HALF_AM" || r.type === "HALF_PM") return sum + 0.5;
    const ms =
      new Date(r.endDate).getTime() - new Date(r.startDate).getTime();
    return sum + Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
  }, 0);

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {t("admin.users.edit")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {target.name}{" "}
          <span className="text-zinc-400">({target.username})</span>
          {t("admin.users.editSubtitle")}
        </p>
      </div>
      <EditStaffForm
        user={{
          id: target.id,
          username: target.username,
          name: target.name,
          roleId: target.roleId,
          title: target.title,
          joinDate: target.joinDate
            ? target.joinDate.toISOString().slice(0, 10)
            : "",
        }}
        roles={roles}
        isSelf={target.id === me.id}
      />

      <LeaveAdjustPanel
        userId={target.id}
        annualLeaveTotal={target.annualLeaveTotal}
        annualLeaveUsed={target.annualLeaveUsed}
        reservedDays={reservedDays}
        adjustments={adjustments.map((a) => ({
          id: a.id,
          field: a.field,
          before: a.before,
          after: a.after,
          reason: a.reason,
          createdAt: a.createdAt.toISOString(),
          adminName: a.admin.name,
        }))}
      />
    </div>
  );
}

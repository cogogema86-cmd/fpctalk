import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";
import { GroupForm } from "./_form";
import { getT } from "@/lib/i18n/server";

export default async function NewGroupChatPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  const t = await getT();

  // 본인 역할 정보 (레벨 채팅 옵션은 관리자만)
  const meWithRole = await prisma.user.findUnique({
    where: { id: me.id },
    include: { role: true },
  });
  const isAdmin = !!meWithRole?.role.isAdmin;

  const others = await prisma.user.findMany({
    where: { id: { not: me.id } },
    orderBy: [{ role: { sortOrder: "asc" } }, { name: "asc" }],
    include: { role: { select: { label: true, defaultLevel: true } } },
  });

  // 레벨별 사용자 수 (레벨 채팅 만들 때 미리보기)
  const allUsers = await prisma.user.findMany({
    select: { role: { select: { defaultLevel: true } } },
  });
  const levelDistribution: Record<number, number> = {};
  for (const u of allUsers) {
    const lv = u.role.defaultLevel;
    levelDistribution[lv] = (levelDistribution[lv] ?? 0) + 1;
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <Link
        href="/chat/new"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        {t("chat.backTo1on1")}
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {t("chat.newGroupTitle")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {isAdmin ? t("chat.adminGroupHint") : t("chat.staffGroupHint")}
        </p>
      </div>

      <GroupForm
        candidates={others.map((u) => ({
          id: u.id,
          name: u.name,
          username: u.username,
          roleLabel: u.role.label,
          level: u.role.defaultLevel,
        }))}
        isAdmin={isAdmin}
        myLevel={meWithRole?.role.defaultLevel ?? 0}
        levelDistribution={levelDistribution}
      />
    </div>
  );
}

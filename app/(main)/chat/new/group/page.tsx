import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";
import { GroupForm } from "./_form";

export default async function NewGroupChatPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const others = await prisma.user.findMany({
    where: { id: { not: me.id } },
    orderBy: [{ role: { sortOrder: "asc" } }, { name: "asc" }],
    include: { role: { select: { label: true } } },
  });

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <Link
        href="/chat/new"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← 1:1 채팅 시작
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          그룹 채팅 만들기
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          이름을 정하고 함께할 멤버 2명 이상을 선택하세요. (본인 자동 포함)
        </p>
      </div>

      <GroupForm
        candidates={others.map((u) => ({
          id: u.id,
          name: u.name,
          username: u.username,
          roleLabel: u.role.label,
        }))}
      />
    </div>
  );
}

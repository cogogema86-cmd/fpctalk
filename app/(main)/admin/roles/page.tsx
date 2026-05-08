import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { CreateRoleForm } from "./_components/create-role-form";
import { RolesTable } from "./_components/roles-table";

export default async function AdminRolesPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { authId: authUser.id },
    include: { role: true },
  });
  if (!me || !me.role.isAdmin) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        관리자 전용 페이지입니다.
      </div>
    );
  }

  const roles = await prisma.staffRole.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { users: true } },
    },
  });

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          역할 관리
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          시스템 기본 6개 + 추가한 커스텀 역할 — 직원에게 부여
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3 bg-white dark:bg-zinc-950">
        <h2 className="font-semibold">새 역할 추가</h2>
        <CreateRoleForm />
      </section>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <RolesTable roles={roles} />
      </section>

      <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 p-4 text-xs text-zinc-500 space-y-1">
        <div>💡 <strong>레벨</strong>: 0(일반) ~ 3(원장급) — 향후 권한 차등에 활용</div>
        <div>💡 <strong>관리권한</strong>: 직원/역할 추가, 비번 초기화 등 가능</div>
        <div>💡 <strong>시스템 역할</strong>: 기본 6개는 삭제 불가, 라벨/정렬만 변경 가능</div>
      </div>
    </div>
  );
}

import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { EditStaffForm } from "./_form";

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
  if (!me || !me.role.isAdmin) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        관리자 전용 페이지입니다.
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

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          직원 편집
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {target.name} <span className="text-zinc-400">({target.username})</span>의 정보를 수정합니다.
        </p>
      </div>
      <EditStaffForm
        user={{
          id: target.id,
          username: target.username,
          name: target.name,
          roleId: target.roleId,
          title: target.title,
        }}
        roles={roles}
        isSelf={target.id === me.id}
      />
    </div>
  );
}

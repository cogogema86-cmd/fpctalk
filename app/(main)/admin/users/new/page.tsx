import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { CreateStaffForm } from "./_form";

export default async function NewStaffPage() {
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
    select: { id: true, code: true, label: true, isAdmin: true },
  });

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          직원 추가
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          신규 직원 정보를 입력하세요. 생성된 비밀번호는 한 번만 노출됩니다.
        </p>
      </div>
      <CreateStaffForm roles={roles} />
    </div>
  );
}

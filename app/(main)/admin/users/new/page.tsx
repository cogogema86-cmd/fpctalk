import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
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
  const t = await getT();
  if (!me || !me.role.isAdmin || !me.role.canManageUsers) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        {t("common.adminOnly")}
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
          {t("admin.users.create")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t("admin.users.createHint")}
        </p>
      </div>
      <CreateStaffForm roles={roles} />
    </div>
  );
}

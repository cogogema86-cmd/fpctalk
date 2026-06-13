import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
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
  const t = await getT();
  if (!me || !me.role.isAdmin || !me.role.canManageRoles) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        {t("admin.roles.noPermission")}
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
          {t("nav.adminRoles")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t("admin.roles.subtitle")}
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3 bg-white dark:bg-zinc-950">
        <h2 className="font-semibold">{t("admin.roles.newRoleHeader")}</h2>
        <CreateRoleForm />
      </section>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <RolesTable roles={roles} />
      </section>

      <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 p-4 text-xs text-zinc-500 space-y-1">
        <div>{t("admin.roles.tipLevel")}</div>
        <div>{t("admin.roles.tipAdmin")}</div>
        <div>{t("admin.roles.tipSystem")}</div>
      </div>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ResetPasswordButton } from "./_components/reset-password-button";
import { ActiveToggle } from "./_components/active-toggle";
import { getLocale, getT } from "@/lib/i18n/server";

export default async function AdminUsersPage() {
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
  const locale = await getLocale();
  const dateLocale = locale === "en" ? "en-US" : "ko-KR";

  if (!me || !me.role.isAdmin || !me.role.canManageUsers) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        {t("docDetail.adminOnly")}
      </div>
    );
  }

  const users = await prisma.user.findMany({
    orderBy: [
      { role: { sortOrder: "asc" } },
      { name: "asc" },
    ],
    include: { role: true },
  });

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {t("adm.users.title")}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t("adm.users.totalUnit")} {users.length}
          </p>
        </div>
        <Link
          href="/admin/users/new"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
        >
          {t("adm.users.add")}
        </Link>
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
            <tr>
              <th className="text-left px-4 py-2 font-medium">
                {t("adm.users.username")}
              </th>
              <th className="text-left px-4 py-2 font-medium">
                {t("adm.users.name")}
              </th>
              <th className="text-left px-4 py-2 font-medium">
                {t("adm.users.role")}
              </th>
              <th className="text-left px-4 py-2 font-medium">
                {t("adm.users.title2")}
              </th>
              <th className="text-left px-4 py-2 font-medium">
                {t("adm.users.joined")}
              </th>
              <th className="text-left px-4 py-2 font-medium">
                {t("adm.users.manage")}
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className={`border-t border-zinc-200 dark:border-zinc-800 ${
                  u.active ? "" : "bg-zinc-50/60 dark:bg-zinc-900/40 opacity-60"
                }`}
              >
                <td className="px-4 py-2 text-zinc-900 dark:text-zinc-100 font-mono">
                  {u.username}
                </td>
                <td className="px-4 py-2">
                  {u.name}
                  {!u.active && (
                    <span className="ml-2 inline-flex items-center rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 text-[10px] font-medium">
                      비활성
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <RoleBadge label={u.role.label} isAdmin={u.role.isAdmin} />
                </td>
                <td className="px-4 py-2 text-zinc-500">
                  {u.title || "—"}
                </td>
                <td className="px-4 py-2 text-zinc-500">
                  {u.createdAt.toLocaleDateString(dateLocale)}
                </td>
                <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                  <Link
                    href={`/admin/users/${u.id}/edit`}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {t("adm.users.edit")}
                  </Link>
                  {u.id === me.id ? (
                    <span className="text-xs text-zinc-400">
                      {t("adm.users.self")}
                    </span>
                  ) : (
                    <>
                      <ResetPasswordButton
                        userId={u.id}
                        username={u.username}
                        name={u.name}
                      />
                      <ActiveToggle
                        userId={u.id}
                        name={u.name}
                        active={u.active}
                      />
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleBadge({ label, isAdmin }: { label: string; isAdmin: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
        isAdmin
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
      }`}
    >
      {label}
      {isAdmin && <span className="ml-1">⚙️</span>}
    </span>
  );
}

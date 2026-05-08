import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ResetPasswordButton } from "./_components/reset-password-button";

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

  if (!me || !me.role.isAdmin) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        관리자 전용 페이지입니다.
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
            직원 관리
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            현재 등록된 직원 {users.length}명
          </p>
        </div>
        <Link
          href="/admin/users/new"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
        >
          + 직원 추가
        </Link>
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
            <tr>
              <th className="text-left px-4 py-2 font-medium">아이디</th>
              <th className="text-left px-4 py-2 font-medium">이름</th>
              <th className="text-left px-4 py-2 font-medium">역할</th>
              <th className="text-left px-4 py-2 font-medium">직책</th>
              <th className="text-left px-4 py-2 font-medium">가입일</th>
              <th className="text-left px-4 py-2 font-medium">관리</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-t border-zinc-200 dark:border-zinc-800"
              >
                <td className="px-4 py-2 text-zinc-900 dark:text-zinc-100 font-mono">
                  {u.username}
                </td>
                <td className="px-4 py-2">{u.name}</td>
                <td className="px-4 py-2">
                  <RoleBadge label={u.role.label} isAdmin={u.role.isAdmin} />
                </td>
                <td className="px-4 py-2 text-zinc-500">
                  {u.title || "—"}
                </td>
                <td className="px-4 py-2 text-zinc-500">
                  {u.createdAt.toLocaleDateString("ko-KR")}
                </td>
                <td className="px-4 py-2">
                  {u.id === me.id ? (
                    <span className="text-xs text-zinc-400">(본인)</span>
                  ) : (
                    <ResetPasswordButton
                      userId={u.id}
                      username={u.username}
                      name={u.name}
                    />
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

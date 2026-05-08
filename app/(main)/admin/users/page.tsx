import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { authId: authUser.id },
    select: { role: true },
  });

  if (!me || (me.role !== "PRINCIPAL" && me.role !== "VICE")) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        관리자 전용 페이지입니다.
      </div>
    );
  }

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      level: true,
      createdAt: true,
    },
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
        <button
          disabled
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 opacity-50 cursor-not-allowed"
          title="STEP 3 후속 작업에서 구현 예정"
        >
          + 직원 추가
        </button>
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
            <tr>
              <th className="text-left px-4 py-2 font-medium">아이디</th>
              <th className="text-left px-4 py-2 font-medium">이름</th>
              <th className="text-left px-4 py-2 font-medium">역할</th>
              <th className="text-left px-4 py-2 font-medium">레벨</th>
              <th className="text-left px-4 py-2 font-medium">가입일</th>
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
                <td className="px-4 py-2">{roleLabel(u.role)}</td>
                <td className="px-4 py-2">{u.level}</td>
                <td className="px-4 py-2 text-zinc-500">
                  {u.createdAt.toLocaleDateString("ko-KR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function roleLabel(role: string) {
  switch (role) {
    case "PRINCIPAL":
      return "원장";
    case "VICE":
      return "부원장";
    case "TEACHER":
      return "강사";
    case "DRIVER":
      return "기사";
    case "ASSISTANT":
      return "동승";
    case "STAFF":
    default:
      return "일반";
  }
}

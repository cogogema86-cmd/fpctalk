import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";
import { startDmAction } from "../actions";

export default async function NewChatPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  // 본인 제외 모든 직원
  const others = await prisma.user.findMany({
    where: { id: { not: me.id } },
    orderBy: [
      { role: { sortOrder: "asc" } },
      { name: "asc" },
    ],
    include: { role: { select: { label: true } } },
  });

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/chat"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← 채팅 목록
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          새 채팅 시작
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          대화할 직원을 선택하세요. 1:1 채팅이 시작됩니다.
        </p>
      </div>

      {others.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center text-zinc-500">
          <div>아직 다른 직원이 없습니다.</div>
          <Link
            href="/admin/users/new"
            className="mt-3 inline-block text-sm text-blue-600 dark:text-blue-400 underline"
          >
            직원 추가하러 가기
          </Link>
        </div>
      ) : (
        <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-200 dark:divide-zinc-800">
          {others.map((u) => (
            <li key={u.id}>
              <form action={startDmAction}>
                <input type="hidden" name="userId" value={u.id} />
                <button
                  type="submit"
                  className="w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium text-zinc-900 dark:text-zinc-50">
                      {u.name}
                      {u.title && (
                        <span className="ml-2 text-sm font-normal text-zinc-500">
                          {u.title}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      <span className="font-mono">{u.username}</span>
                      <span className="mx-1.5">·</span>
                      <span>{u.role.label}</span>
                    </div>
                  </div>
                  <span className="text-zinc-400 text-sm">→</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

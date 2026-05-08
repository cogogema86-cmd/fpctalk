import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe, getMyChats } from "@/lib/chat";

export default async function ChatListPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const chats = await getMyChats(me.id);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            채팅
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            현재 채팅방 {chats.length}개
          </p>
        </div>
        <Link
          href="/chat/new"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
        >
          + 새 채팅
        </Link>
      </div>

      {chats.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-12 text-center text-zinc-500">
          <div className="text-4xl mb-2">💬</div>
          <div>아직 채팅방이 없습니다.</div>
          <Link
            href="/chat/new"
            className="mt-3 inline-block text-sm text-blue-600 dark:text-blue-400 underline"
          >
            첫 채팅 시작하기
          </Link>
        </div>
      ) : (
        <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-200 dark:divide-zinc-800">
          {chats.map((c) => (
            <li key={c.chatId}>
              <Link
                href={`/chat/${c.chatId}`}
                className="block px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-900 dark:text-zinc-50 truncate">
                        {c.title}
                      </span>
                      {c.type === "GROUP" && (
                        <span className="text-xs rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-zinc-600 dark:text-zinc-400">
                          그룹
                        </span>
                      )}
                      {c.unread > 0 && (
                        <span className="text-xs rounded-full bg-red-500 text-white px-1.5 py-0.5">
                          새 메시지
                        </span>
                      )}
                    </div>
                    {c.lastMessage ? (
                      <div className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400 truncate">
                        {c.lastMessage.content}
                      </div>
                    ) : (
                      <div className="mt-0.5 text-sm text-zinc-400 italic">
                        아직 메시지가 없습니다
                      </div>
                    )}
                  </div>
                  {c.lastMessage && (
                    <span className="text-xs text-zinc-400 shrink-0">
                      {formatTime(c.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatTime(date: Date): string {
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

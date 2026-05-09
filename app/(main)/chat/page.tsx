import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe, getMyChats } from "@/lib/chat";
import { getLocale, getT } from "@/lib/i18n/server";

export default async function ChatListPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const chats = await getMyChats(me.id);
  const totalUnread = chats.reduce((s, c) => s + c.unread, 0);

  const t = await getT();
  const locale = await getLocale();
  const dateLocale = locale === "en" ? "en-US" : "ko-KR";
  const timeFormatter = new Intl.DateTimeFormat(dateLocale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateFormatter = new Intl.DateTimeFormat(dateLocale, {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {t("chat.title")}
            {totalUnread > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[1.5rem] h-6 rounded-full bg-red-500 text-white text-xs font-medium px-2 align-middle">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t("chat.totalRooms")} {chats.length}
            {t("chat.roomsUnit")}
          </p>
        </div>
        <Link
          href="/chat/new"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
        >
          {t("chat.newChat")}
        </Link>
      </div>

      {chats.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-12 text-center text-zinc-500">
          <div className="text-4xl mb-2">💬</div>
          <div>{t("chat.empty")}</div>
          <Link
            href="/chat/new"
            className="mt-3 inline-block text-sm text-blue-600 dark:text-blue-400 underline"
          >
            {t("chat.startFirst")}
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-zinc-900 dark:text-zinc-50 truncate">
                        {c.title}
                      </span>
                      {c.type === "GROUP" && !c.isLevelChat && (
                        <span className="text-xs rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-zinc-600 dark:text-zinc-400">
                          {t("chat.groupTag")}
                        </span>
                      )}
                      {c.isLevelChat && (
                        <span className="text-xs rounded bg-amber-100 dark:bg-amber-950 px-1.5 py-0.5 text-amber-800 dark:text-amber-200">
                          ⭐ {t("chat.levelTag")} {c.levelRequired}+
                        </span>
                      )}
                    </div>
                    {c.lastMessage ? (
                      <div className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400 truncate">
                        {c.lastMessage.content}
                      </div>
                    ) : (
                      <div className="mt-0.5 text-sm text-zinc-400 italic">
                        {t("chat.noMessages")}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {c.lastMessage && (
                      <span className="text-xs text-zinc-400">
                        {formatTime(
                          c.lastMessage.createdAt,
                          timeFormatter,
                          dateFormatter,
                          t("chat.daysAgo"),
                        )}
                      </span>
                    )}
                    {c.unread > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full bg-red-500 text-white text-[11px] font-semibold px-1.5">
                        {c.unread > 99 ? "99+" : c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatTime(
  date: Date,
  timeFormatter: Intl.DateTimeFormat,
  dateFormatter: Intl.DateTimeFormat,
  daysAgoLabel: string,
): string {
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return timeFormatter.format(date);
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays < 7) return `${diffDays}${daysAgoLabel}`;
  return dateFormatter.format(date);
}

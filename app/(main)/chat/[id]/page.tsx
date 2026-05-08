import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  getChatInfo,
  getChatMessages,
  getMe,
  markAsRead,
} from "@/lib/chat";
import { ChatRoom } from "./_chat-room";

export default async function ChatRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: chatId } = await params;
  const me = await getMe();
  if (!me) redirect("/login");

  const info = await getChatInfo(chatId, me.id);
  if (!info) notFound();

  const messages = await getChatMessages(chatId, me.id);
  // 진입 시 읽음 표시
  await markAsRead(chatId, me.id).catch(() => {});

  return (
    <div className="h-[calc(100vh-58px)] md:h-[calc(100vh-58px)] flex flex-col">
      {/* 헤더 */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center gap-3 bg-white dark:bg-black">
        <Link
          href="/chat"
          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{info.title}</div>
          <div className="text-xs text-zinc-500">
            {info.type === "DM"
              ? "1:1 채팅"
              : `그룹 · 멤버 ${info.members.length}명`}
          </div>
        </div>
      </div>

      {/* 채팅 본체 (Client Component) */}
      <ChatRoom
        chatId={chatId}
        meId={me.id}
        meName={me.name}
        initialMessages={messages.map((m) => ({
          id: m.id,
          chatId: m.chatId,
          userId: m.userId,
          content: m.content,
          type: m.type,
          createdAt: m.createdAt.toISOString(),
          user: m.user,
        }))}
      />
    </div>
  );
}

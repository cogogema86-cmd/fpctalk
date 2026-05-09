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

  // markAsRead는 유저가 메시지를 다 본 다음에 호출해야 의미 있음.
  // 입장 시점에 미리 갱신하면 unread 카운트 즉시 0 되어버려 "마지막 읽음" 위치 표시가 망가짐.
  // → 입장 시점의 lastReadAt을 그대로 ChatRoom에 전달하고, 클라이언트가 메시지 보고 나서 markAsRead 호출

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
          <div className="font-semibold truncate flex items-center gap-2">
            {info.title}
            {info.isLevelChat && (
              <span className="text-xs rounded bg-amber-100 dark:bg-amber-950 px-1.5 py-0.5 text-amber-800 dark:text-amber-200 font-normal">
                ⭐ 레벨 {info.levelRequired}+
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-500">
            {info.type === "DM"
              ? "1:1 채팅"
              : info.isLevelChat
                ? `레벨 ${info.levelRequired}+ 자동 공개`
                : `그룹 · 멤버 ${info.members.length}명`}
          </div>
        </div>
      </div>

      {/* 채팅 본체 */}
      <ChatRoom
        chatId={chatId}
        meId={me.id}
        meName={me.name}
        members={info.members.map((m) => ({
          id: m.user.id,
          username: m.user.username,
          name: m.user.name,
        }))}
        myLastReadAt={info.myLastReadAt?.toISOString() ?? null}
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

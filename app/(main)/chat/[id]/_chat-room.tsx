"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendMessageAction, type SendMessageState } from "../actions";

type Message = {
  id: string;
  chatId: string;
  userId: string | null;
  content: string;
  type: string;
  createdAt: string;
  user: { id: string; username: string; name: string } | null;
};

type Member = {
  id: string;
  username: string;
  name: string;
};

const initialState: SendMessageState = {};

export function ChatRoom({
  chatId,
  meId,
  meName,
  members,
  initialMessages,
}: {
  chatId: string;
  meId: string;
  meName: string;
  members: Member[];
  initialMessages: Message[];
}) {
  // 멤버 id → 정보 맵 (Realtime으로 들어오는 새 메시지에 작성자 이름 부착)
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [state, formAction, isPending] = useActionState(
    sendMessageAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 메시지 도착 시 스크롤 맨 아래로
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  // memberMap을 effect 의존성에서 안정적으로 사용하기 위해 변환
  // (지금은 매 렌더마다 새 Map이지만 effect 안에선 closure로 캡쳐)

  // Realtime 구독
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "Message",
          filter: `chatId=eq.${chatId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            chatId: string;
            userId: string | null;
            content: string;
            type: string;
            createdAt: string;
          };

          // 이미 있으면 무시 (중복 방지)
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            // 작성자 정보: 본인이거나 멤버맵에서 찾음
            let user: { id: string; username: string; name: string } | null = null;
            if (row.userId === meId) {
              user = { id: meId, username: "", name: meName };
            } else if (row.userId) {
              const m = memberMap.get(row.userId);
              if (m) user = m;
            }
            return [
              ...prev,
              {
                id: row.id,
                chatId: row.chatId,
                userId: row.userId,
                content: row.content,
                type: row.type,
                createdAt: row.createdAt,
                user,
              },
            ];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // memberMap은 매 렌더마다 새로 생성되지만 effect 안에서 closure로 사용 — chatId가 같으면 재구독 불필요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, meId, meName, members]);

  // 전송 후 입력칸 비우기
  const handleSubmit = (formData: FormData) => {
    const content = formData.get("content") as string;
    if (!content?.trim()) return;
    formAction(formData);
    if (inputRef.current) inputRef.current.value = "";
  };

  // Enter로 전송, Shift+Enter는 줄바꿈
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  return (
    <>
      {/* 메시지 영역 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-zinc-50 dark:bg-zinc-950"
      >
        {messages.length === 0 ? (
          <div className="text-center text-sm text-zinc-400 py-8">
            첫 메시지를 보내보세요.
          </div>
        ) : (
          messages.map((m, i) => {
            const isMine = m.userId === meId;
            const prev = messages[i - 1];
            const showAuthor =
              !isMine && (!prev || prev.userId !== m.userId);
            return (
              <MessageBubble
                key={m.id}
                message={m}
                isMine={isMine}
                showAuthor={showAuthor}
              />
            );
          })
        )}
      </div>

      {/* 입력 영역 */}
      <form
        ref={formRef}
        action={handleSubmit}
        className="border-t border-zinc-200 dark:border-zinc-800 p-3 bg-white dark:bg-black"
      >
        <input type="hidden" name="chatId" value={chatId} />
        {state.error && (
          <div className="mb-2 text-xs text-red-600 dark:text-red-400">
            {state.error}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            name="content"
            placeholder="메시지를 입력하세요... (Enter: 전송, Shift+Enter: 줄바꿈)"
            rows={1}
            disabled={isPending}
            onKeyDown={handleKeyDown}
            className="flex-1 resize-none rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50 max-h-32"
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 shrink-0"
          >
            {isPending ? "전송중" : "전송"}
          </button>
        </div>
      </form>
    </>
  );
}

function MessageBubble({
  message,
  isMine,
  showAuthor,
}: {
  message: Message;
  isMine: boolean;
  showAuthor: boolean;
}) {
  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[70%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
        {showAuthor && message.user && (
          <div className="text-xs text-zinc-500 mb-0.5 px-1">
            {message.user.name}
          </div>
        )}
        <div
          className={`rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap ${
            isMine
              ? "bg-blue-500 text-white"
              : "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700"
          }`}
        >
          {message.content}
        </div>
        <div className="text-[10px] text-zinc-400 mt-0.5 px-1">
          {new Date(message.createdAt).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}

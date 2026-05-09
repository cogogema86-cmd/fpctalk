"use client";

import { Fragment, useActionState, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  markAsReadAction,
  sendMessageAction,
  type SendMessageState,
} from "../actions";

type Message = {
  id: string;
  chatId: string;
  userId: string | null;
  content: string;
  type: string;
  createdAt: string;
  user: { id: string; username: string; name: string } | null;
  /** 낙관적 UI: 전송 클릭 직후 임시 메시지 (Realtime 도착 시 교체) */
  pending?: boolean;
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
  myLastReadAt,
  initialMessages,
}: {
  chatId: string;
  meId: string;
  meName: string;
  members: Member[];
  myLastReadAt: string | null;
  initialMessages: Message[];
}) {
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [state, formAction, isPending] = useActionState(
    sendMessageAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const initialScrollDoneRef = useRef(false);

  // "여기서부터 안 읽음" 구분선이 들어갈 첫 메시지 인덱스
  // 본인 메시지가 아니면서 lastReadAt 이후인 첫 메시지
  const lastReadTime = myLastReadAt ? new Date(myLastReadAt).getTime() : 0;
  const firstUnreadIdx = (() => {
    if (!myLastReadAt) {
      // 처음 진입 (멤버십도 없거나 lastReadAt 없음) — 메시지 있으면 첫 unread는 본인 아닌 첫 메시지
      const idx = initialMessages.findIndex((m) => m.userId !== meId);
      return idx >= 0 ? idx : -1;
    }
    return initialMessages.findIndex(
      (m) => m.userId !== meId && new Date(m.createdAt).getTime() > lastReadTime,
    );
  })();

  // 진입 시 초기 스크롤: 미읽 메시지 있으면 구분선으로, 없으면 맨 아래
  useEffect(() => {
    if (initialScrollDoneRef.current) return;
    initialScrollDoneRef.current = true;
    setTimeout(() => {
      if (firstUnreadIdx >= 0 && dividerRef.current && scrollRef.current) {
        // 구분선이 화면 상단에 가깝게 오도록
        dividerRef.current.scrollIntoView({ block: "start" });
        // 약간 위로 여백 (구분선 위 메시지 한두 개도 보이게)
        scrollRef.current.scrollTop = Math.max(
          0,
          scrollRef.current.scrollTop - 80,
        );
      } else {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }
      // 진입 후 markAsRead (조금 늦게 호출 — 사용자가 화면 본 후)
      setTimeout(() => {
        markAsReadAction(chatId).catch(() => {});
      }, 1500);
    }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 새 메시지 도착 시 (이미 진입 후): 자동 스크롤만 — 구분선은 그대로 둠
  useEffect(() => {
    if (!initialScrollDoneRef.current) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

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
          setMessages((prev) => {
            // 이미 있으면 무시 (중복 방지)
            if (prev.some((m) => m.id === row.id)) return prev;

            let user: { id: string; username: string; name: string } | null =
              null;
            if (row.userId === meId) {
              user = { id: meId, username: "", name: meName };
            } else if (row.userId) {
              const m = memberMap.get(row.userId);
              if (m) user = m;
            }

            // 본인 메시지가 도착하면 같은 내용의 pending 임시 메시지 제거 (교체)
            const filtered =
              row.userId === meId
                ? prev.filter(
                    (m) => !(m.pending && m.content === row.content),
                  )
                : prev;

            return [
              ...filtered,
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
          // 새 메시지 도착 시 markAsRead (사용자가 보고 있다고 가정)
          // 다른 사람이 보낸 메시지면 갱신
          if (row.userId !== meId) {
            markAsReadAction(chatId).catch(() => {});
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, meId, meName, members]);

  const handleSubmit = (formData: FormData) => {
    const raw = formData.get("content") as string;
    const content = raw?.trim();
    if (!content) return;

    // 낙관적 UI: 임시 메시지 즉시 추가 (Realtime 도착 시 교체됨)
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        chatId,
        userId: meId,
        content,
        type: "TEXT",
        createdAt: new Date().toISOString(),
        user: { id: meId, username: "", name: meName },
        pending: true,
      },
    ]);

    formAction(formData);
    if (inputRef.current) inputRef.current.value = "";
  };

  // 서버 액션 실패 시 pending 임시 메시지 정리
  useEffect(() => {
    if (state.error) {
      setMessages((prev) => prev.filter((m) => !m.pending));
    }
  }, [state.error]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  return (
    <>
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
            const showDivider = i === firstUnreadIdx;
            return (
              <Fragment key={m.id}>
                {showDivider && <UnreadDivider ref={dividerRef} />}
                <MessageBubble
                  message={m}
                  isMine={isMine}
                  showAuthor={showAuthor}
                />
              </Fragment>
            );
          })
        )}
      </div>

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

const UnreadDivider = ({
  ref,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
}) => (
  <div ref={ref} className="flex items-center gap-2 py-2">
    <div className="flex-1 h-px bg-red-300 dark:bg-red-700" />
    <span className="text-xs font-medium text-red-600 dark:text-red-400 px-2 bg-zinc-50 dark:bg-zinc-950">
      여기서부터 안 읽음
    </span>
    <div className="flex-1 h-px bg-red-300 dark:bg-red-700" />
  </div>
);

function MessageBubble({
  message,
  isMine,
  showAuthor,
}: {
  message: Message;
  isMine: boolean;
  showAuthor: boolean;
}) {
  const isPending = !!message.pending;
  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[70%] ${isMine ? "items-end" : "items-start"} flex flex-col transition-opacity ${
          isPending ? "opacity-60" : ""
        }`}
      >
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
        <div className="text-[10px] text-zinc-400 mt-0.5 px-1 flex items-center gap-1">
          {isPending && <span className="text-zinc-400">전송 중...</span>}
          {!isPending &&
            new Date(message.createdAt).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
        </div>
      </div>
    </div>
  );
}

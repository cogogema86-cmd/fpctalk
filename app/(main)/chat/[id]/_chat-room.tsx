"use client";

import {
  Fragment,
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  deleteMessageAction,
  getMessagesSinceAction,
  markAsReadAction,
  sendMessageAction,
  translateMessageAction,
  triggerChatAiAction,
  type SendMessageState,
} from "../actions";
import { useT } from "@/lib/i18n/client";
import {
  approveEventProposalAction,
  cancelEventProposalAction,
} from "@/app/(main)/events/actions";

// @비서 / @AI / @assistant / @ + 공백 + 텍스트 모두 매칭
const AI_TRIGGER = /^@(?:비서|ai|assistant)?\s+\S/i;
// 사용자 입력에서 @ 트리거 부분 제거하는 정규식 (시작에 @[키워드?]+공백)
const AI_TRIGGER_STRIP = /^@(?:비서|ai|assistant)?\s+/i;

/**
 * 메시지 본문에서 @이름 멘션을 파란색으로 강조해서 렌더.
 * - @ + 한글/영문 (공백·구두점·줄바꿈 전까지)을 매칭
 * - isMine(파란 배경 안)이면 흰색 굵게, 아니면 파란색
 */
function renderWithMentions(content: string, isMine: boolean): React.ReactNode {
  const parts = content.split(/(@[\p{L}\p{N}_가-힣]+)/gu);
  return parts.map((p, i) => {
    if (p.startsWith("@")) {
      return (
        <span
          key={i}
          className={
            isMine
              ? "font-semibold underline decoration-white/60"
              : "font-semibold text-blue-600 dark:text-blue-400"
          }
        >
          {p}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

type Message = {
  id: string;
  chatId: string;
  userId: string | null;
  content: string;
  type: string;
  createdAt: string;
  user: { id: string; username: string; name: string } | null;
  metadata?: unknown;
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
  const t = useT();
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  // 폴링에서 항상 최신 messages를 참조하기 위한 ref
  const messagesRef = useRef<Message[]>(initialMessages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
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

  // 5초 폴링 백업: Realtime이 끊겨도 새 메시지 catch-up
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      // 마지막 메시지 시간 또는 5분 전 (초기값)
      const last = (() => {
        if (messagesRef.current.length === 0)
          return new Date(Date.now() - 5 * 60 * 1000).toISOString();
        // pending 제외하고 가장 최근 메시지
        const real = messagesRef.current.filter(
          (m) => !m.id.startsWith("temp-"),
        );
        const lastMsg = real[real.length - 1];
        return lastMsg
          ? lastMsg.createdAt
          : new Date(Date.now() - 5 * 60 * 1000).toISOString();
      })();

      try {
        const newOnes = await getMessagesSinceAction(chatId, last);
        if (stopped || newOnes.length === 0) return;
        setMessages((prev) => {
          const existing = new Set(prev.map((m) => m.id));
          const filtered = newOnes.filter((n) => !existing.has(n.id));
          if (filtered.length === 0) return prev;
          // 본인 메시지가 도착하면 같은 내용의 pending 제거
          let next = prev;
          for (const n of filtered) {
            if (n.userId === meId) {
              next = next.filter(
                (m) => !(m.pending && m.content === n.content),
              );
            }
          }
          return [...next, ...filtered];
        });
      } catch {
        // 무시
      }
    };

    const interval = setInterval(tick, 5000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, meId]);

  // Realtime 구독 (메인) — 끊기면 폴링이 백업
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
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[chat ${chatId}] Realtime status: ${status}`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, meId, meName, members]);

  const handleSubmit = (formData: FormData) => {
    const raw = formData.get("content") as string;
    const content = raw?.trim();
    if (!content) return;

    // 답글 대상 attach
    if (replyTo) {
      formData.set("replyTo", JSON.stringify(replyTo));
    }

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
        metadata: replyTo ? { replyTo } : undefined,
        pending: true,
      },
    ]);

    formAction(formData);
    if (inputRef.current) inputRef.current.value = "";
    setReplyTo(null);

    // @비서 / @AI / @ 단독 호출 감지 → AI 비서에게 별도 요청
    const aiMatch = AI_TRIGGER.exec(content);
    if (aiMatch) {
      const aiPrompt = content.replace(AI_TRIGGER_STRIP, "").trim();
      if (aiPrompt) {
        // fire-and-forget — AI 답변은 Realtime/폴링으로 도착
        triggerChatAiAction(chatId, aiPrompt).catch((err) => {
          console.error("[chat AI] trigger failed:", err);
        });
      }
    }
  };

  // 서버 액션 실패 시 pending 임시 메시지 정리
  useEffect(() => {
    if (state.error) {
      setMessages((prev) => prev.filter((m) => !m.pending));
    }
  }, [state.error]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 픽커 열려있을 때 Esc로 닫기
    if (showMentionPicker && e.key === "Escape") {
      e.preventDefault();
      setShowMentionPicker(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  // @ 입력 감지: 시작 또는 공백 다음의 "@" → 픽커
  const [showMentionPicker, setShowMentionPicker] = useState(false);

  // 답글 대상 (있으면 입력창 위에 인용 박스 표시 + 전송 시 metadata.replyTo)
  const [replyTo, setReplyTo] = useState<{
    messageId: string;
    userName: string;
    contentPreview: string;
  } | null>(null);

  const startReply = (msg: Message) => {
    setReplyTo({
      messageId: msg.id,
      userName: msg.user?.name ?? "",
      contentPreview: msg.content.slice(0, 100),
    });
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const ta = e.target;
    const cursor = ta.selectionStart;
    const before = ta.value.slice(0, cursor);
    if (before.length === 0) {
      setShowMentionPicker(false);
      return;
    }
    const lastChar = before[before.length - 1];
    if (lastChar !== "@") {
      setShowMentionPicker(false);
      return;
    }
    // @ 앞이 비어있거나 공백/줄바꿈이어야 함
    const beforeAt = before[before.length - 2];
    const isAtStart =
      before.length === 1 ||
      beforeAt === " " ||
      beforeAt === "\n" ||
      beforeAt === "\t";
    setShowMentionPicker(isAtStart);
  };

  const insertMention = (label: string) => {
    const ta = inputRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart;
    const before = ta.value.slice(0, cursor);
    const after = ta.value.slice(cursor);
    // 마지막 @ 를 제거하고 @{label} 삽입
    const newBefore = before.slice(0, -1) + `@${label} `;
    ta.value = newBefore + after;
    ta.setSelectionRange(newBefore.length, newBefore.length);
    ta.focus();
    setShowMentionPicker(false);
  };

  return (
    <>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-zinc-50 dark:bg-zinc-950"
      >
        {messages.length === 0 ? (
          <div className="text-center text-sm text-zinc-400 py-8">
            {t("chat.firstMessage")}
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
                  onReply={startReply}
                />
              </Fragment>
            );
          })
        )}
      </div>

      <form
        ref={formRef}
        action={handleSubmit}
        className="relative border-t border-zinc-200 dark:border-zinc-800 p-3 bg-white dark:bg-black"
      >
        <input type="hidden" name="chatId" value={chatId} />

        {replyTo && (
          <div className="mb-2 flex items-stretch gap-2 rounded-lg border-l-4 border-zinc-400 dark:border-zinc-500 bg-zinc-200/80 dark:bg-zinc-800 px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                ↩ {t("chat.replyingTo")}: {replyTo.userName}
              </div>
              <div
                className="text-xs text-zinc-700 dark:text-zinc-300 mt-0.5 leading-snug overflow-hidden"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  wordBreak: "break-word",
                }}
              >
                {replyTo.contentPreview}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-sm px-1 self-start"
              aria-label={t("chat.replyCancel")}
            >
              ✕
            </button>
          </div>
        )}

        {/* @ 자동완성 픽커 */}
        {showMentionPicker && (
          <div className="absolute bottom-full left-3 mb-1 z-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-1 min-w-[220px] max-h-72 overflow-y-auto">
            <div className="text-[10px] text-zinc-400 px-2 py-1">
              {t("chat.aiSummonTitle")}
            </div>
            <button
              type="button"
              onClick={() => insertMention("AI")}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm"
            >
              <span className="font-mono">@AI</span>{" "}
              <span className="text-zinc-400 text-xs">{t("chat.summonEn")}</span>
            </button>
            <button
              type="button"
              onClick={() => insertMention("비서")}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm"
            >
              <span className="font-mono">@비서</span>{" "}
              <span className="text-zinc-400 text-xs">{t("chat.summonKo")}</span>
            </button>

            {members.filter((m) => m.id !== meId).length > 0 && (
              <>
                <div className="border-t border-zinc-100 dark:border-zinc-800 my-1" />
                <div className="text-[10px] text-zinc-400 px-2 py-1">
                  {t("chat.mentionMember")}
                </div>
                {members
                  .filter((m) => m.id !== meId)
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => insertMention(m.name)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm flex items-center gap-2"
                    >
                      <span className="text-blue-600 dark:text-blue-400 font-medium">
                        @{m.name}
                      </span>
                      <span className="text-zinc-400 text-xs truncate">
                        {m.username}
                      </span>
                    </button>
                  ))}
              </>
            )}
          </div>
        )}

        {state.error && (
          <div className="mb-2 text-xs text-red-600 dark:text-red-400">
            {state.error}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            name="content"
            placeholder={t("chat.inputPh")}
            rows={1}
            disabled={isPending}
            onKeyDown={handleKeyDown}
            onChange={handleInputChange}
            onBlur={() => {
              // 픽커 클릭 처리 시간을 두고 닫기
              setTimeout(() => setShowMentionPicker(false), 150);
            }}
            className="flex-1 resize-none rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50 max-h-32"
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 shrink-0"
          >
            {isPending ? t("chat.sendingShort") : t("chat.sendShort")}
          </button>
        </div>
      </form>
    </>
  );
}

function AiMessageBubble({ message }: { message: Message }) {
  const t = useT();
  type AiMeta = { model?: string; mode?: "fast" | "pro" };
  const meta = (message as Message & { metadata?: AiMeta }).metadata as
    | AiMeta
    | undefined;
  const [translation, setTranslation] = useState<string | null>(null);
  const [transError, setTransError] = useState<string | null>(null);
  const [isTransPending, startTransTransition] = useTransition();

  const handleTranslate = (target: "ko" | "en") => {
    setTransError(null);
    startTransTransition(async () => {
      const r = await translateMessageAction(message.content, target);
      if (r.error) {
        setTransError(r.error);
        return;
      }
      if (r.translation) setTranslation(r.translation);
    });
  };

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] flex flex-col">
        <div className="text-xs mb-0.5 px-1 flex items-center gap-1.5">
          <span className="text-purple-700 dark:text-purple-300 font-medium">
            {t("chat.aiBot")}
          </span>
          {meta?.mode && (
            <span className="text-[10px] text-zinc-400">
              {meta.mode === "pro" ? "🔵 Pro" : "🟢 Flash"}
            </span>
          )}
        </div>
        <div className="rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap bg-purple-50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-100 border border-purple-200 dark:border-purple-800">
          {message.content}
        </div>

        {translation && (
          <div className="mt-1 rounded-xl px-3 py-2 text-xs whitespace-pre-wrap bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
            <div className="text-[9px] text-zinc-500 mb-0.5">{t("chat.translation")}</div>
            {translation}
          </div>
        )}
        {transError && (
          <div className="mt-1 text-[10px] text-red-500 px-1">{transError}</div>
        )}

        <div className="text-[10px] text-zinc-400 mt-0.5 px-1 flex items-center gap-2">
          <span>
            {new Date(message.createdAt).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {!translation && !isTransPending && (
            <>
              <button
                type="button"
                onClick={() => handleTranslate("ko")}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline"
              >
                {t("chat.koreanShort")}
              </button>
              <button
                type="button"
                onClick={() => handleTranslate("en")}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline"
              >
                English
              </button>
            </>
          )}
          {isTransPending && (
            <span className="text-zinc-500">{t("chat.translatingShort")}</span>
          )}
          {translation && (
            <button
              type="button"
              onClick={() => {
                setTranslation(null);
                setTransError(null);
              }}
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline"
            >
              {t("chat.translationClose")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const UnreadDivider = ({
  ref,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
}) => {
  const t = useT();
  return (
    <div ref={ref} className="flex items-center gap-2 py-2">
      <div className="flex-1 h-px bg-red-300 dark:bg-red-700" />
      <span className="text-xs font-medium text-red-600 dark:text-red-400 px-2 bg-zinc-50 dark:bg-zinc-950">
        {t("chat.unreadDivider")}
      </span>
      <div className="flex-1 h-px bg-red-300 dark:bg-red-700" />
    </div>
  );
};

type ProposalMeta = {
  state?: "PENDING" | "APPROVED" | "CANCELLED";
  title?: string;
  startDate?: string;
  endDate?: string;
  location?: string | null;
  eventId?: string;
};

function EventProposalBubble({
  message,
  isMine,
}: {
  message: Message;
  isMine: boolean;
}) {
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const meta = (message.metadata ?? {}) as ProposalMeta;
  const state = meta.state ?? "PENDING";

  const dateRange = (() => {
    if (!meta.startDate) return "";
    const s = new Date(meta.startDate);
    const e = meta.endDate ? new Date(meta.endDate) : null;
    const fmt = new Intl.DateTimeFormat(undefined, {
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    if (!e || s.toDateString() === e.toDateString()) {
      return fmt.format(s);
    }
    const fmtDay = new Intl.DateTimeFormat(undefined, {
      month: "long",
      day: "numeric",
    });
    return `${fmtDay.format(s)} ~ ${fmtDay.format(e)}`;
  })();

  const onApprove = () =>
    startTransition(async () => {
      const r = await approveEventProposalAction(message.id);
      if (!r.ok) setError(r.error ?? t("common.error"));
    });
  const onCancel = () =>
    startTransition(async () => {
      const r = await cancelEventProposalAction(message.id);
      if (!r.ok) setError(r.error ?? t("common.error"));
    });

  const stateBadge = (() => {
    if (state === "APPROVED")
      return (
        <span className="text-[10px] rounded bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300 px-1.5 py-0.5">
          ✓ {t("event.proposal.approved")}
        </span>
      );
    if (state === "CANCELLED")
      return (
        <span className="text-[10px] rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5">
          {t("event.proposal.cancelled")}
        </span>
      );
    return null;
  })();

  return (
    <div className="flex justify-center">
      <div className="max-w-[90%] rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm">
        <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 mb-1">
          🤖 <span>{t("event.proposal.aiSays")}</span>
          {stateBadge}
        </div>
        <div className="font-semibold text-amber-900 dark:text-amber-100">
          {meta.title ?? message.content}
        </div>
        {dateRange && (
          <div className="text-xs text-amber-800 dark:text-amber-200 mt-1">
            📅 {dateRange}
          </div>
        )}
        {meta.location && (
          <div className="text-xs text-amber-800 dark:text-amber-200">
            📍 {meta.location}
          </div>
        )}
        <div className="text-xs text-amber-700 dark:text-amber-300 mt-2">
          {t("event.proposal.question")}
        </div>

        {state === "PENDING" && isMine && (
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={onApprove}
              disabled={isPending}
              className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1.5 disabled:opacity-50"
            >
              {isPending ? t("event.proposal.processing") : t("event.proposal.approve")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 text-xs font-medium px-3 py-1.5 disabled:opacity-50"
            >
              {t("event.proposal.cancel")}
            </button>
          </div>
        )}
        {state === "PENDING" && !isMine && (
          <div className="text-[11px] text-amber-700 dark:text-amber-300 mt-2 italic">
            {t("event.proposal.authorOnly")}
          </div>
        )}
        {error && (
          <div className="text-[11px] text-red-600 mt-1">{error}</div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  isMine,
  showAuthor,
  onReply,
}: {
  message: Message;
  isMine: boolean;
  showAuthor: boolean;
  onReply: (m: Message) => void;
}) {
  const t = useT();
  const [translation, setTranslation] = useState<string | null>(null);
  const [transError, setTransError] = useState<string | null>(null);
  const [isTransPending, startTransTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [isDeleted, setIsDeleted] = useState(false);

  if (message.type === "AI") {
    return <AiMessageBubble message={message} />;
  }
  if (message.type === "EVENT_PROPOSAL") {
    return <EventProposalBubble message={message} isMine={isMine} />;
  }

  const isPending = !!message.pending || isDeleting;
  const meta = (message.metadata ?? {}) as {
    replyTo?: { messageId: string; userName: string; contentPreview: string };
  };

  const handleDelete = () => {
    if (!confirm(t("chat.deleteConfirm"))) return;
    startDeleteTransition(async () => {
      const r = await deleteMessageAction(message.id);
      if (r.ok) setIsDeleted(true);
    });
  };

  if (isDeleted) {
    return (
      <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
        <div className="text-[11px] text-zinc-400 italic px-3 py-1">
          {t("chat.deleted")}
        </div>
      </div>
    );
  }

  const handleTranslate = (target: "ko" | "en") => {
    setTransError(null);
    startTransTransition(async () => {
      const r = await translateMessageAction(message.content, target);
      if (r.error) {
        setTransError(r.error);
        return;
      }
      if (r.translation) setTranslation(r.translation);
    });
  };

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] ${isMine ? "items-end" : "items-start"} flex flex-col transition-opacity ${
          isPending ? "opacity-60" : ""
        }`}
      >
        {showAuthor && message.user && (
          <div className="text-xs text-zinc-500 mb-0.5 px-1">
            {message.user.name}
          </div>
        )}
        {meta.replyTo && (
          <div className="mb-1 max-w-full rounded-lg border-l-4 border-zinc-400 dark:border-zinc-500 bg-zinc-200/80 dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300">
            <div className="font-semibold text-zinc-600 dark:text-zinc-400 mb-0.5 flex items-center gap-1">
              <span>↩</span>
              <span>{meta.replyTo.userName}</span>
            </div>
            <div
              className="leading-snug overflow-hidden"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                wordBreak: "break-word",
              }}
            >
              {meta.replyTo.contentPreview}
            </div>
          </div>
        )}
        <div
          className={`rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap ${
            isMine
              ? "bg-blue-500 text-white"
              : "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700"
          }`}
        >
          {renderWithMentions(message.content, isMine)}
        </div>

        {translation && (
          <div
            className={`mt-1 rounded-xl px-3 py-2 text-xs whitespace-pre-wrap ${
              isMine
                ? "bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 border border-blue-200 dark:border-blue-900"
                : "bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700"
            }`}
          >
            <div className="text-[9px] text-zinc-500 mb-0.5">{t("chat.translation")}</div>
            {translation}
          </div>
        )}
        {transError && (
          <div className="mt-1 text-[10px] text-red-500 px-1">{transError}</div>
        )}

        <div className="text-[10px] text-zinc-400 mt-0.5 px-1 flex items-center gap-2">
          {isPending && <span className="text-zinc-400">{t("chat.sending")}</span>}
          {!isPending && (
            <>
              <span>
                {new Date(message.createdAt).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {!translation && !isTransPending && (
                <>
                  <button
                    type="button"
                    onClick={() => handleTranslate("ko")}
                    className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline"
                  >
                    {t("chat.koreanShort")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTranslate("en")}
                    className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline"
                  >
                    English
                  </button>
                </>
              )}
              {isTransPending && (
                <span className="text-zinc-500">{t("chat.translatingShort")}</span>
              )}
              {translation && (
                <button
                  type="button"
                  onClick={() => {
                    setTranslation(null);
                    setTransError(null);
                  }}
                  className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline"
                >
                  {t("chat.translationClose")}
                </button>
              )}
              <button
                type="button"
                onClick={() => onReply(message)}
                title={t("chat.replyTo")}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline"
              >
                ↩ {t("chat.replyTo")}
              </button>
              {isMine && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  title={t("chat.deleteMessage")}
                  className="text-red-500/70 hover:text-red-600 dark:hover:text-red-400 hover:underline disabled:opacity-50"
                >
                  {isDeleting ? t("chat.deleting") : "🗑"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

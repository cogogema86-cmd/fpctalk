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
  closeOrderAction,
  deleteMessageAction,
  getMessagesSinceAction,
  getOrderMessagesAction,
  markAsReadAction,
  sendMessageAction,
  submitOrderResponseAction,
  translateMessageAction,
  translateTextsAction,
  triggerChatAiAction,
  type SendMessageState,
} from "../actions";
import { useT, useLocale } from "@/lib/i18n/client";
import {
  approveEventProposalAction,
  cancelEventProposalAction,
} from "@/app/(main)/events/actions";
import { QuickPhrases } from "./_quick-phrases";

// @비서 / @AI / @assistant / @ + 공백 + 텍스트 모두 매칭
const AI_TRIGGER = /^@(?:비서|ai|assistant)?\s+\S/i;
// 사용자 입력에서 @ 트리거 부분 제거하는 정규식 (시작에 @[키워드?]+공백)
const AI_TRIGGER_STRIP = /^@(?:비서|ai|assistant)?\s+/i;

/**
 * 메시지가 질문형인지 — AI 자동 응답 모드용 휴리스틱.
 * 정규식만 사용 (LLM 호출 X)이라 비용 0.
 *  - 끝이 ? / ？ (전각 물음표)
 *  - 한국어 의문사: 어떻게/어떡/어디/언제/뭐/무엇/누가/왜/얼마/어느/어떤/할까(요)/하나요/있나요/되나요/할지/될지
 *  - 영어 의문사 (단어 경계): how/what/where/when/who/why/which
 */
function isQuestionLike(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/[?？]\s*$/u.test(t)) return true;
  if (/(어떻게|어떡|어디|언제|뭐|무엇|누가|왜|얼마|어느|어떤|할까|하나요|있나요|있어요|되나요|할지|될지|어떨까|어떻하)/u.test(t))
    return true;
  if (/\b(how|what|where|when|who|why|which)\b/i.test(t)) return true;
  return false;
}

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
  /** 본인 메시지에 대해서만 의미 있음 — 안 읽은 인원 수 */
  unreadCount?: number;
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
  isAdmin,
  aiAutoReply,
  members,
  myLastReadAt,
  initialMessages,
}: {
  chatId: string;
  meId: string;
  meName: string;
  isAdmin: boolean;
  /** 채팅방의 AI 자동 응답 모드. true면 질문형 메시지에 AI가 자동 답변. */
  aiAutoReply: boolean;
  members: Member[];
  myLastReadAt: string | null;
  initialMessages: Message[];
}) {
  const t = useT();
  const locale = useLocale();
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

  // ORDER 메시지 metadata 폴링 (Realtime UPDATE가 metadata를 못 보내는 경우 백업)
  // 구조적으로 동일한 데이터면 reference 유지 — 번역 등 자식 state 보존.
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const orders = await getOrderMessagesAction(chatId);
        if (stopped || orders.length === 0) return;
        setMessages((prev) =>
          prev.map((m) => {
            const order = orders.find((o) => o.id === m.id);
            if (!order) return m;
            // 구조적 동일성 — 같으면 reference 유지(React가 sub-tree 재렌더 안 하도록).
            const sameMeta =
              JSON.stringify(m.metadata ?? null) ===
              JSON.stringify(order.metadata ?? null);
            const sameContent = m.content === order.content;
            const sameType = m.type === order.type;
            if (sameMeta && sameContent && sameType) return m;
            return {
              ...m,
              metadata: order.metadata,
              content: order.content,
              type: order.type,
            };
          }),
        );
      } catch {
        // 무시
      }
    };
    void tick();
    const id = setInterval(tick, 5000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [chatId]);

  // 본인 메시지의 안 읽은 인원 수 폴링 (다른 멤버가 읽으면 카운트 줄어듦)
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/chat/${chatId}/unread-counts`, {
          cache: "no-store",
        });
        if (!res.ok || stopped) return;
        const data = (await res.json()) as Record<string, number>;
        setMessages((prev) =>
          prev.map((m) =>
            m.id in data ? { ...m, unreadCount: data[m.id] } : m,
          ),
        );
      } catch {
        // 무시
      }
    };
    void tick();
    const id = setInterval(tick, 5000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [chatId]);

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
          let changed = false;
          const next = prev.slice();

          for (const n of newOnes) {
            const idx = next.findIndex((m) => m.id === n.id);
            if (idx >= 0) {
              // 같은 ID 존재 (옵티미스틱 메시지가 clientMessageId로 미리 추가됨)
              // → pending 해제 + 서버 데이터로 갱신. Realtime이 막혀도 5초 안에 풀림.
              if (next[idx].pending) {
                next[idx] = {
                  ...next[idx],
                  content: n.content,
                  type: n.type,
                  createdAt: n.createdAt,
                  metadata: n.metadata,
                  pending: false,
                };
                changed = true;
              }
            } else {
              // 새 메시지 — content 매칭으로 legacy pending 제거 후 추가
              if (n.userId === meId) {
                const pendingIdx = next.findIndex(
                  (m) => m.pending && m.content === n.content,
                );
                if (pendingIdx >= 0) {
                  next.splice(pendingIdx, 1);
                }
              }
              next.push(n);
              changed = true;
            }
          }

          return changed ? next : prev;
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
            metadata?: unknown;
          };
          // 채팅방 초기화 시스템 메시지 — 모든 메시지 비우고 이 메시지만 남기기
          const meta = (row.metadata ?? {}) as { kind?: string };
          if (meta.kind === "ROOM_CLEARED") {
            setMessages([
              {
                id: row.id,
                chatId: row.chatId,
                userId: null,
                content: row.content,
                type: row.type,
                createdAt: row.createdAt,
                user: null,
                metadata: row.metadata,
              },
            ]);
            return;
          }

          setMessages((prev) => {
            // 이미 같은 ID 있으면 (= 본인 임시 메시지 = 클라이언트 ID 사용)
            // → in-place 갱신: metadata 첨부 + pending 해제. React key 변경 안 됨.
            const existingIdx = prev.findIndex((m) => m.id === row.id);
            if (existingIdx >= 0) {
              const next = prev.slice();
              next[existingIdx] = {
                ...prev[existingIdx],
                metadata: row.metadata ?? prev[existingIdx].metadata,
                pending: false,
              };
              return next;
            }

            let user: { id: string; username: string; name: string } | null =
              null;
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
                metadata: row.metadata,
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
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "Message",
          filter: `chatId=eq.${chatId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            content?: string;
            type?: string;
            metadata?: unknown;
          };
          if (!row.id) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === row.id
                ? {
                    ...m,
                    content: row.content ?? m.content,
                    type: row.type ?? m.type,
                    metadata:
                      row.metadata !== undefined ? row.metadata : m.metadata,
                  }
                : m,
            ),
          );
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
    const content = (raw ?? "").trim();
    // 본문 또는 첨부 둘 중 하나는 있어야 함
    if (!content && !pendingAttachment) return;

    // 답글 대상 attach
    if (replyTo) {
      formData.set("replyTo", JSON.stringify(replyTo));
    }

    // 첨부 attach
    if (pendingAttachment) {
      formData.set("attachment", JSON.stringify(pendingAttachment));
    }

    // 클라이언트가 메시지 ID 미리 생성 → server에 전달 → 임시/실제 ID 동일.
    // React key가 변경되지 않으므로 컴포넌트 unmount 안 됨 (번역 등 state 보존).
    const clientId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
    formData.set("clientMessageId", clientId);

    // 옵티미스틱 메시지 type/content/metadata 결정
    const optimisticType: "TEXT" | "IMAGE" | "FILE" = pendingAttachment
      ? pendingAttachment.kind === "image"
        ? "IMAGE"
        : "FILE"
      : "TEXT";
    const optimisticContent =
      content || pendingAttachment?.name || "[첨부]";
    const optimisticMeta: Record<string, unknown> = {};
    if (replyTo) optimisticMeta.replyTo = replyTo;
    if (pendingAttachment) optimisticMeta.attachment = pendingAttachment;

    // 낙관적 UI: 임시 메시지 즉시 추가 (Realtime 도착 시 동일 ID로 교체)
    setMessages((prev) => [
      ...prev,
      {
        id: clientId,
        chatId,
        userId: meId,
        content: optimisticContent,
        type: optimisticType,
        createdAt: new Date().toISOString(),
        user: { id: meId, username: "", name: meName },
        metadata: Object.keys(optimisticMeta).length > 0 ? optimisticMeta : undefined,
        pending: true,
      },
    ]);

    formAction(formData);
    if (inputRef.current) inputRef.current.value = "";
    setReplyTo(null);
    setPendingAttachment(null);
    setUploadStatus(null);

    // Realtime이 광고 차단/방화벽에 막힌 환경(특히 크롬 확장) 대비 fallback:
    // 1.5초 안에 pending이 안 풀렸으면 강제 해제. (서버 저장은 이미 완료됐을 가능성 큼)
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === clientId && m.pending ? { ...m, pending: false } : m,
        ),
      );
    }, 1500);

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
    } else if (aiAutoReply && isQuestionLike(content)) {
      // AI 자동 응답 모드: @prefix 없는 일반 질문 메시지 → 원문 그대로 AI에 prompt
      triggerChatAiAction(chatId, content.trim()).catch((err) => {
        console.error("[chat AI auto-reply] trigger failed:", err);
      });
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

  // 첨부 파일 (이미지/동영상) — 업로드 완료된 attachment metadata
  type Attach = {
    kind: "image" | "video" | "file";
    path: string;
    mime: string;
    size: number;
    name: string;
    expiresAt: string;
  };
  const [pendingAttachment, setPendingAttachment] = useState<Attach | null>(
    null,
  );
  const [uploadStatus, setUploadStatus] = useState<{
    isUploading: boolean;
    fileName?: string;
    error?: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    setUploadStatus({ isUploading: false, error: undefined, fileName: file.name });
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      setUploadStatus({
        isUploading: false,
        error: "이미지/동영상만 첨부할 수 있습니다.",
      });
      return;
    }
    const maxBytes = isImage ? 10 * 1024 * 1024 : 30 * 1024 * 1024;
    if (file.size > maxBytes) {
      const limitMb = Math.round(maxBytes / 1024 / 1024);
      setUploadStatus({
        isUploading: false,
        error: `파일이 너무 큽니다 (최대 ${limitMb}MB)`,
      });
      return;
    }
    setUploadStatus({ isUploading: true, fileName: file.name });
    setPendingAttachment(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/chat/${chatId}/upload`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setUploadStatus({
          isUploading: false,
          error: err?.error ?? "업로드 실패",
        });
        return;
      }
      const data = (await res.json()) as { attachment: Attach };
      setPendingAttachment(data.attachment);
      setUploadStatus(null);
    } catch (e) {
      setUploadStatus({
        isUploading: false,
        error: e instanceof Error ? e.message : "업로드 실패",
      });
    }
  };

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

  // 활성 주문 (open 상태) — 채팅 흐름에서 빠지고 하단 sticky로 노출
  const activeOrder = messages.find((m) => {
    if (m.type !== "ORDER") return false;
    const meta = (m.metadata ?? {}) as { status?: string };
    return meta.status !== "closed";
  });
  const visibleMessages = activeOrder
    ? messages.filter((m) => m.id !== activeOrder.id)
    : messages;

  // 스크롤 중 우측 상단에 현재 보이는 메시지의 날짜 표시 (카카오톡 스타일)
  // 스크롤이 멈추면 1.2초 후 사라짐
  const [floatingDate, setFloatingDate] = useState<string | null>(null);
  const floatingHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const floatingRafRef = useRef(0);

  const handleFloatingDateScroll = () => {
    cancelAnimationFrame(floatingRafRef.current);
    floatingRafRef.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const nodes = el.querySelectorAll<HTMLElement>("[data-msg-date]");
      for (const n of nodes) {
        // 화면 상단에 걸쳐 있는 첫 메시지의 날짜
        if (n.getBoundingClientRect().bottom >= top + 8) {
          setFloatingDate(n.dataset.msgDate ?? null);
          break;
        }
      }
      if (floatingHideTimer.current) clearTimeout(floatingHideTimer.current);
      floatingHideTimer.current = setTimeout(() => setFloatingDate(null), 1200);
    });
  };

  useEffect(
    () => () => {
      if (floatingHideTimer.current) clearTimeout(floatingHideTimer.current);
      cancelAnimationFrame(floatingRafRef.current);
    },
    [],
  );

  return (
    <>
      {aiAutoReply && (
        <div className="px-4 py-2 text-[11px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-b border-emerald-200 dark:border-emerald-900">
          🤖 {t("chat.aiAutoReply.banner")}
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={handleFloatingDateScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-zinc-50 dark:bg-zinc-950"
      >
        {/* 스크롤 중 우측 상단 떠다니는 날짜 (h-0 sticky — 레이아웃 영향 없음) */}
        <div className="sticky top-0 z-10 h-0 flex justify-end pointer-events-none">
          <span
            className={`rounded-full bg-zinc-700/80 dark:bg-zinc-200/90 text-white dark:text-zinc-900 text-[11px] px-3 py-1 shadow transition-opacity duration-300 ${
              floatingDate ? "opacity-100" : "opacity-0"
            }`}
          >
            {floatingDate ? formatDateLabel(floatingDate, locale) : ""}
          </span>
        </div>
        {visibleMessages.length === 0 ? (
          <div className="text-center text-sm text-zinc-400 py-8">
            {t("chat.firstMessage")}
          </div>
        ) : (
          visibleMessages.map((m, i) => {
            const isMine = m.userId === meId;
            const prev = visibleMessages[i - 1];
            const showAuthor =
              !isMine && (!prev || prev.userId !== m.userId);
            const showDivider = i === firstUnreadIdx;
            // 날짜가 바뀌는 첫 메시지(맨 첫 메시지 포함) 위에 날짜 구분선
            const showDateDivider =
              !prev || !isSameLocalDay(prev.createdAt, m.createdAt);
            return (
              <Fragment key={m.id}>
                {showDateDivider && (
                  <DateDivider dateStr={m.createdAt} locale={locale} />
                )}
                {showDivider && <UnreadDivider ref={dividerRef} />}
                <div data-msg-date={m.createdAt}>
                  <MessageBubble
                    message={m}
                    isMine={isMine}
                    showAuthor={showAuthor}
                    onReply={startReply}
                  />
                </div>
              </Fragment>
            );
          })
        )}
      </div>

      {activeOrder && (
        <ActiveOrderBar
          message={activeOrder}
          meId={meId}
          isAdmin={isAdmin}
        />
      )}

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

        {/* 첨부 진행/오류 표시 */}
        {uploadStatus && (
          <div
            className={`mb-2 text-xs flex items-center gap-2 ${
              uploadStatus.error
                ? "text-red-600 dark:text-red-400"
                : "text-zinc-500"
            }`}
          >
            {uploadStatus.isUploading
              ? `📎 ${uploadStatus.fileName} 업로드 중...`
              : uploadStatus.error}
            {uploadStatus.error && (
              <button
                type="button"
                onClick={() => setUploadStatus(null)}
                className="text-zinc-400 hover:text-zinc-600"
                aria-label="닫기"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* 첨부 미리보기 pill (업로드 완료, 전송 대기) */}
        {pendingAttachment && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2 py-1.5 text-xs">
            <span className="text-base leading-none">
              {pendingAttachment.kind === "image" ? "🖼" : pendingAttachment.kind === "video" ? "🎬" : "📎"}
            </span>
            <span className="truncate max-w-[16rem]">{pendingAttachment.name}</span>
            <span className="text-zinc-400">
              {(pendingAttachment.size / 1024).toFixed(0)}KB
            </span>
            <button
              type="button"
              onClick={() => setPendingAttachment(null)}
              className="text-zinc-400 hover:text-red-500 ml-1"
              aria-label="첨부 취소"
            >
              ✕
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              void handleFileSelect(f);
              // 동일 파일 재선택 가능하도록 reset
              e.target.value = "";
            }
          }}
        />

        {/* 자주 쓰는 문구 — 가로 스크롤 칩 (모바일/PC 모두 자연 fit) */}
        <QuickPhrases
          locale={locale}
          onInsert={(phrase) => {
            const ta = inputRef.current;
            if (!ta) return;
            const start = ta.selectionStart ?? ta.value.length;
            const end = ta.selectionEnd ?? ta.value.length;
            const cur = ta.value;
            const needsSpaceBefore =
              start > 0 && !/\s$/.test(cur.slice(0, start));
            const insert = (needsSpaceBefore ? " " : "") + phrase;
            const next = cur.slice(0, start) + insert + cur.slice(end);
            // React-controlled가 아닌 textarea — native setter로 값 갱신 + input 이벤트 발사
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype,
              "value",
            )?.set;
            setter?.call(ta, next);
            ta.dispatchEvent(new Event("input", { bubbles: true }));
            const caret = start + insert.length;
            ta.focus();
            ta.setSelectionRange(caret, caret);
          }}
        />

        <div
          className={`flex items-end gap-2 rounded-md transition-colors ${
            isDragging
              ? "ring-2 ring-blue-400 bg-blue-50/50 dark:bg-blue-950/30"
              : ""
          }`}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setIsDragging(true);
            }
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFileSelect(f);
          }}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending || uploadStatus?.isUploading}
            title="이미지/동영상 첨부 (드래그도 가능)"
            className="shrink-0 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3 py-2 text-lg disabled:opacity-50"
          >
            📎
          </button>
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
            disabled={isPending || uploadStatus?.isUploading}
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
          {(message.unreadCount ?? 0) > 0 && (
            <span
              className="text-amber-600 dark:text-amber-400 font-semibold"
              title={t("chat.unreadCount")}
            >
              {message.unreadCount}
            </span>
          )}
          <span>
            {new Date(message.createdAt).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <button
            type="button"
            onClick={() => handleTranslate("ko")}
            disabled={isTransPending}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline disabled:opacity-50"
          >
            {t("chat.koreanShort")}
          </button>
          <button
            type="button"
            onClick={() => handleTranslate("en")}
            disabled={isTransPending}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline disabled:opacity-50"
          >
            English
          </button>
          <button
            type="button"
            onClick={() => {
              setTranslation(null);
              setTransError(null);
            }}
            disabled={!translation}
            title={t("chat.translationClose")}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ✕
          </button>
          {isTransPending && (
            <span className="text-zinc-500">{t("chat.translatingShort")}</span>
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

/** 두 ISO 시각이 (현지 시간대 기준) 같은 날인지 */
function isSameLocalDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/** 날짜 라벨 포맷 — ko: "2026년 6월 12일 금요일", en: "Friday, June 12, 2026" */
function formatDateLabel(dateStr: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(dateStr));
}

/**
 * 날짜가 바뀌는 첫 메시지 위에 표시하는 가운데 날짜 구분선 (카카오톡 스타일).
 */
function DateDivider({ dateStr, locale }: { dateStr: string; locale: string }) {
  const label = formatDateLabel(dateStr, locale);
  return (
    <div className="flex justify-center py-1.5">
      <span className="rounded-full bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 text-[11px] px-3 py-1">
        {label}
      </span>
    </div>
  );
}

type OrderMetaClient = {
  title?: string;
  placeholder?: string;
  status?: "open" | "closed";
  createdByName?: string;
  closedAt?: string;
  responses?: Array<{
    userId: string;
    name: string;
    choice: string;
    at: string;
  }>;
};

function ActiveOrderBar({
  message,
  meId,
  isAdmin,
}: {
  message: Message;
  meId: string;
  isAdmin: boolean;
}) {
  const t = useT();
  const [choice, setChoice] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 본인 응답 즉시 반영용 local override (server action 결과)
  const [localMeta, setLocalMeta] = useState<OrderMetaClient | null>(null);

  // 번역 결과 (toggle): null이면 원문, 있으면 번역본
  const [translation, setTranslation] = useState<{
    title: string;
    placeholder: string;
    responses: string[];
  } | null>(null);
  const [transPending, startTransPending] = useTransition();

  // props로 들어온 metadata가 "구조적으로" 갱신되면 local override 초기화 + 번역 stale 방지.
  // 폴링이 같은 내용을 반환할 때 reference만 바뀌어 번역이 reset되는 회귀 방지.
  const metaSig = JSON.stringify(message.metadata ?? null);
  useEffect(() => {
    setLocalMeta(null);
    setTranslation(null);
  }, [metaSig]);

  const meta = (localMeta ?? (message.metadata ?? {})) as OrderMetaClient;
  const responses = meta.responses ?? [];
  const myResponse = responses.find((r) => r.userId === meId);
  const canClose = message.userId === meId || isAdmin;

  // 표시값 — 번역본 있으면 그것, 없으면 원문
  const displayTitle = translation?.title ?? meta.title ?? message.content;
  const displayPlaceholder =
    translation?.placeholder ?? meta.placeholder ?? "";
  const displayResponses = responses.map((r, i) => ({
    ...r,
    choice: translation?.responses[i] ?? r.choice,
  }));

  const onTranslate = (target: "ko" | "en") => {
    const texts = [
      meta.title ?? "",
      meta.placeholder ?? "",
      ...responses.map((r) => r.choice),
    ];
    startTransPending(async () => {
      const r = await translateTextsAction(texts, target);
      if (r.translations) {
        setTranslation({
          title: r.translations[0] ?? "",
          placeholder: r.translations[1] ?? "",
          responses: r.translations.slice(2),
        });
      }
    });
  };

  // 마지막 본인 응답을 입력칸에 미리 채움 (재제출/수정 편의)
  useEffect(() => {
    if (myResponse && choice === "") {
      setChoice(myResponse.choice);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myResponse?.choice]);

  const submit = () => {
    const c = choice.trim();
    if (!c) {
      setError(t("order.empty"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await submitOrderResponseAction(message.id, c);
      if (!r.ok) {
        setError(r.error ?? t("common.error"));
        return;
      }
      if (r.metadata) {
        setLocalMeta(r.metadata as OrderMetaClient);
      }
    });
  };

  const close = () => {
    if (!confirm(t("order.closeConfirm"))) return;
    setError(null);
    startTransition(async () => {
      const r = await closeOrderAction(message.id);
      if (!r.ok) {
        setError(r.error ?? t("common.error"));
        return;
      }
      if (r.metadata) {
        setLocalMeta(r.metadata as OrderMetaClient);
      }
    });
  };

  return (
    <div className="border-t border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-3 max-h-[55vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-amber-900 dark:text-amber-100 flex items-center gap-1.5 flex-wrap">
            <span>📋</span>
            <span>{displayTitle}</span>
            <span className="text-[11px] font-normal text-amber-700 dark:text-amber-300">
              ({meta.createdByName ?? message.user?.name ?? ""}{" "}
              {t("order.createdBy")})
            </span>
          </div>
          <div className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
            {t("order.participants")}: {responses.length}
          </div>
        </div>
        {canClose && (
          <button
            type="button"
            onClick={close}
            disabled={isPending}
            className="rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-3 py-1.5 disabled:opacity-50 shrink-0"
          >
            {isPending ? t("order.closing") : `✅ ${t("order.close")}`}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-2">
        <input
          type="text"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={displayPlaceholder || t("order.placeholderDefault")}
          disabled={isPending}
          maxLength={100}
          className="flex-1 rounded-md border border-amber-300 dark:border-amber-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-1.5 disabled:opacity-50 shrink-0"
        >
          {myResponse ? t("order.update") : t("order.submit")}
        </button>
      </div>

      {/* 번역 토글 — 한글 / English / ✕ 모두 항상 표시 */}
      <div className="flex items-center gap-2 mb-2 text-[11px]">
        <span className="text-zinc-500">🌐</span>
        <button
          type="button"
          onClick={() => onTranslate("ko")}
          disabled={transPending}
          className="text-amber-700 dark:text-amber-300 hover:underline disabled:opacity-50"
        >
          {t("chat.koreanShort")}
        </button>
        <button
          type="button"
          onClick={() => onTranslate("en")}
          disabled={transPending}
          className="text-amber-700 dark:text-amber-300 hover:underline disabled:opacity-50"
        >
          English
        </button>
        <button
          type="button"
          onClick={() => setTranslation(null)}
          disabled={!translation}
          title={t("chat.translationClose")}
          className="text-zinc-600 dark:text-zinc-400 hover:underline disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ✕
        </button>
        {transPending && (
          <span className="text-zinc-500">{t("chat.translatingShort")}</span>
        )}
      </div>

      {error && (
        <div className="text-[11px] text-red-600 dark:text-red-400 mb-1">
          {error}
        </div>
      )}

      {displayResponses.length > 0 && (
        <ul className="space-y-1 text-sm border-t border-amber-200 dark:border-amber-900 pt-2 mt-1">
          {displayResponses.map((r) => (
            <li
              key={r.userId}
              className={`flex items-baseline gap-2 ${
                r.userId === meId
                  ? "text-amber-900 dark:text-amber-100 font-medium"
                  : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              <span className="min-w-[5rem] truncate">{r.name}</span>
              <span className="text-zinc-400">→</span>
              <span className="flex-1 truncate">{r.choice}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClosedOrderBubble({ message }: { message: Message }) {
  const t = useT();
  const meta = (message.metadata ?? {}) as OrderMetaClient;
  const responses = meta.responses ?? [];

  const [translation, setTranslation] = useState<{
    title: string;
    responses: string[];
  } | null>(null);
  const [transPending, startTransPending] = useTransition();

  const displayTitle = translation?.title ?? meta.title ?? message.content;
  const displayResponses = responses.map((r, i) => ({
    ...r,
    choice: translation?.responses[i] ?? r.choice,
  }));

  const onTranslate = (target: "ko" | "en") => {
    const texts = [meta.title ?? "", ...responses.map((r) => r.choice)];
    startTransPending(async () => {
      const r = await translateTextsAction(texts, target);
      if (r.translations) {
        setTranslation({
          title: r.translations[0] ?? "",
          responses: r.translations.slice(1),
        });
      }
    });
  };

  return (
    <div className="flex justify-center">
      <div className="max-w-[95%] w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 p-3 text-sm">
        <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 mb-1">
          <span>✅</span>
          <span className="font-semibold">{t("order.closed")}</span>
          <span className="text-zinc-500">
            · {meta.createdByName ?? message.user?.name ?? ""}
          </span>
        </div>
        <div className="font-bold text-zinc-900 dark:text-zinc-50 mb-1.5">
          {displayTitle}
        </div>
        <div className="text-[11px] text-zinc-500 mb-1.5">
          {t("order.participants")}: {responses.length}
        </div>
        {displayResponses.length > 0 && (
          <ul className="space-y-0.5 text-xs text-zinc-700 dark:text-zinc-300">
            {displayResponses.map((r) => (
              <li key={r.userId} className="flex items-baseline gap-2">
                <span className="min-w-[5rem] truncate font-medium">
                  {r.name}
                </span>
                <span className="text-zinc-400">→</span>
                <span className="flex-1 truncate">{r.choice}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2 mt-2 text-[10px]">
          <span className="text-zinc-500">🌐</span>
          <button
            type="button"
            onClick={() => onTranslate("ko")}
            disabled={transPending}
            className="text-zinc-600 dark:text-zinc-400 hover:underline disabled:opacity-50"
          >
            {t("chat.koreanShort")}
          </button>
          <button
            type="button"
            onClick={() => onTranslate("en")}
            disabled={transPending}
            className="text-zinc-600 dark:text-zinc-400 hover:underline disabled:opacity-50"
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setTranslation(null)}
            disabled={!translation}
            title={t("chat.translationClose")}
            className="text-zinc-500 hover:underline disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ✕
          </button>
          {transPending && (
            <span className="text-zinc-500">{t("chat.translatingShort")}</span>
          )}
        </div>
      </div>
    </div>
  );
}

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

  const [translation, setTranslation] = useState<{
    title: string;
    location: string;
  } | null>(null);
  const [transPending, startTransPending] = useTransition();

  const displayTitle = translation?.title ?? meta.title ?? message.content;
  const displayLocation = translation?.location ?? meta.location ?? "";

  const onTranslate = (target: "ko" | "en") => {
    const texts = [meta.title ?? "", meta.location ?? ""];
    startTransPending(async () => {
      const r = await translateTextsAction(texts, target);
      if (r.translations) {
        setTranslation({
          title: r.translations[0] ?? "",
          location: r.translations[1] ?? "",
        });
      }
    });
  };

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
          {displayTitle}
        </div>
        {dateRange && (
          <div className="text-xs text-amber-800 dark:text-amber-200 mt-1">
            📅 {dateRange}
          </div>
        )}
        {displayLocation && (
          <div className="text-xs text-amber-800 dark:text-amber-200">
            📍 {displayLocation}
          </div>
        )}
        <div className="text-xs text-amber-700 dark:text-amber-300 mt-2">
          {t("event.proposal.question")}
        </div>
        <div className="flex items-center gap-2 mt-1.5 text-[10px]">
          <span className="text-amber-600 dark:text-amber-400">🌐</span>
          <button
            type="button"
            onClick={() => onTranslate("ko")}
            disabled={transPending}
            className="text-amber-700 dark:text-amber-300 hover:underline disabled:opacity-50"
          >
            {t("chat.koreanShort")}
          </button>
          <button
            type="button"
            onClick={() => onTranslate("en")}
            disabled={transPending}
            className="text-amber-700 dark:text-amber-300 hover:underline disabled:opacity-50"
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setTranslation(null)}
            disabled={!translation}
            title={t("chat.translationClose")}
            className="text-amber-700 dark:text-amber-300 hover:underline disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ✕
          </button>
          {transPending && (
            <span className="text-zinc-500">{t("chat.translatingShort")}</span>
          )}
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
  if (message.type === "ORDER") {
    return <ClosedOrderBubble message={message} />;
  }

  const isPending = !!message.pending || isDeleting;
  const meta = (message.metadata ?? {}) as {
    replyTo?: { messageId: string; userName: string; contentPreview: string };
    attachment?: {
      kind?: "image" | "video" | "file";
      path?: string;
      mime?: string;
      size?: number;
      name?: string;
      expiresAt?: string;
      expired?: boolean;
    };
  };
  const attachment = meta.attachment;
  const isExpired = !!attachment?.expired;
  const fileSrc =
    attachment && !isExpired ? `/api/chat/file/${message.id}` : null;
  const downloadHref =
    attachment && !isExpired ? `/api/chat/file/${message.id}?download=1` : null;
  // 첨부 메시지인데 본문이 파일명과 같으면 본문 텍스트는 숨김 (파일명은 첨부 영역에 자동 표시)
  const showContentText =
    !attachment ||
    (message.content && message.content !== attachment.name);

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
        {/* 만료된 첨부 — 회색 placeholder */}
        {attachment && isExpired && (
          <div className="mb-1 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-500 inline-flex items-center gap-2">
            <span>{attachment.kind === "image" ? "🖼" : attachment.kind === "video" ? "🎬" : "📎"}</span>
            <span className="truncate max-w-[14rem]">{attachment.name ?? "첨부"}</span>
            <span className="text-zinc-400">· 만료됨</span>
          </div>
        )}

        {/* 첨부 미디어 (이미지·동영상) — 본문 위에 노출 */}
        {attachment && fileSrc && !isPending && (
          <div className="mb-1 max-w-full">
            {attachment.kind === "image" ? (
              <a
                href={fileSrc}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fileSrc}
                  alt={attachment.name}
                  className="rounded-xl max-w-[240px] sm:max-w-[320px] max-h-[320px] object-contain bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                  loading="lazy"
                />
              </a>
            ) : attachment.kind === "video" ? (
              <video
                src={fileSrc}
                controls
                preload="metadata"
                className="rounded-xl max-w-[240px] sm:max-w-[320px] max-h-[320px] bg-black border border-zinc-200 dark:border-zinc-800"
              >
                {attachment.name}
              </video>
            ) : (
              <a
                href={downloadHref ?? "#"}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                📎 {attachment.name}
              </a>
            )}
            <div className="text-[10px] text-zinc-400 mt-0.5 px-1 flex items-center gap-2">
              {typeof attachment.size === "number" && attachment.size > 0 && (
                <span>{(attachment.size / 1024).toFixed(0)}KB</span>
              )}
              {downloadHref && (
                <a href={downloadHref} className="hover:underline">
                  📥 다운로드
                </a>
              )}
            </div>
          </div>
        )}
        {attachment && isPending && (
          <div className="mb-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-3 text-xs text-zinc-500 inline-flex items-center gap-2">
            <span>{attachment.kind === "image" ? "🖼" : "🎬"}</span>
            <span>{attachment.name}</span>
            <span className="text-zinc-400">{t("chat.sending")}</span>
          </div>
        )}

        {showContentText && (
          <div
            className={`rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap ${
              isMine
                ? "bg-blue-500 text-white"
                : "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700"
            }`}
          >
            {renderWithMentions(message.content, isMine)}
          </div>
        )}

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
              {(message.unreadCount ?? 0) > 0 && (
                <span
                  className="text-amber-600 dark:text-amber-400 font-semibold"
                  title={t("chat.unreadCount")}
                >
                  {message.unreadCount}
                </span>
              )}
              <span>
                {new Date(message.createdAt).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <button
                type="button"
                onClick={() => handleTranslate("ko")}
                disabled={isTransPending}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline disabled:opacity-50"
              >
                {t("chat.koreanShort")}
              </button>
              <button
                type="button"
                onClick={() => handleTranslate("en")}
                disabled={isTransPending}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline disabled:opacity-50"
              >
                English
              </button>
              <button
                type="button"
                onClick={() => {
                  setTranslation(null);
                  setTransError(null);
                }}
                disabled={!translation}
                title={t("chat.translationClose")}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ✕
              </button>
              {isTransPending && (
                <span className="text-zinc-500">{t("chat.translatingShort")}</span>
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

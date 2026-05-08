"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  askAssistantAction,
  type AssistantMode,
  type AssistantResponse,
} from "./actions";

type Msg =
  | {
      id: string;
      role: "user";
      text: string;
      ts: number;
    }
  | {
      id: string;
      role: "assistant";
      text: string;
      modelUsed?: string;
      mode?: "fast" | "pro";
      isError?: boolean;
      ts: number;
    };

const EXAMPLES = [
  { mode: "fast" as const, text: "내일 회의 안내 메시지 짧게 작성해줘" },
  { mode: "fast" as const, text: "이번 주 회의에서 결정된 사항 정리하면 어떻게 적어?" },
  { mode: "pro" as const, text: "여름방학 캠프 학부모 안내문 초안" },
  { mode: "pro" as const, text: "현장학습 동의서 양식 작성해줘" },
];

export function AssistantChat({ userName }: { userName: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [forcedMode, setForcedMode] = useState<AssistantMode>("auto");
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isPending]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;

    const userMsg: Msg = {
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmed,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    startTransition(async () => {
      const result: AssistantResponse = await askAssistantAction(
        trimmed,
        forcedMode,
      );

      if (result.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: result.text,
            modelUsed: result.modelUsed,
            mode: result.mode,
            ts: Date.now(),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            text: result.error,
            isError: true,
            ts: Date.now(),
          },
        ]);
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const clearChat = () => {
    if (messages.length === 0) return;
    if (confirm("대화 내역을 모두 지우시겠습니까?")) {
      setMessages([]);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      {/* 모드 토글 + 초기화 */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 flex items-center justify-between gap-2 bg-zinc-50 dark:bg-zinc-950">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">응답 모드:</span>
          <ModeButton current={forcedMode} value="auto" onChange={setForcedMode}>
            자동
          </ModeButton>
          <ModeButton current={forcedMode} value="fast" onChange={setForcedMode}>
            🟢 일상
          </ModeButton>
          <ModeButton current={forcedMode} value="pro" onChange={setForcedMode}>
            🔵 업무
          </ModeButton>
        </div>
        <button
          type="button"
          onClick={clearChat}
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-30"
          disabled={messages.length === 0}
        >
          대화 초기화
        </button>
      </div>

      {/* 메시지 영역 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-zinc-50 dark:bg-zinc-950"
      >
        {messages.length === 0 ? (
          <Welcome
            userName={userName}
            onPick={(t, m) => {
              setForcedMode(m === "pro" ? "pro" : "auto");
              send(t);
            }}
          />
        ) : (
          messages.map((m) => <Bubble key={m.id} msg={m} />)
        )}
        {isPending && <Thinking />}
      </div>

      {/* 입력 영역 */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-zinc-200 dark:border-zinc-800 p-3 bg-white dark:bg-black"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="질문이나 요청을 입력하세요... (Enter: 전송, Shift+Enter: 줄바꿈)"
            rows={2}
            disabled={isPending}
            className="flex-1 resize-none rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50 max-h-40"
          />
          <button
            type="submit"
            disabled={isPending || !input.trim()}
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 shrink-0"
          >
            {isPending ? "..." : "전송"}
          </button>
        </div>
        <div className="mt-1.5 text-[10px] text-zinc-400">
          답변 모델은 자동 모드일 때 키워드(보고서/분석/검토 등) + 길이로 결정됩니다.
        </div>
      </form>
    </>
  );

  function Welcome({
    userName,
    onPick,
  }: {
    userName: string;
    onPick: (text: string, mode: "fast" | "pro") => void;
  }) {
    return (
      <div className="max-w-2xl mx-auto pt-12 text-center space-y-6">
        <div className="text-5xl">🤖</div>
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            안녕하세요, {userName}님
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            잊어버린 일 다시 알려드리고, 약속한 일정 정리하고, 공지·동의서
            초안을 만들어 드릴 수 있어요.
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            ⚠️ 출퇴근/매출/학사 등 시스템 내부 데이터는 직접 보지 못합니다 — 해당
            메뉴에서 확인해주세요.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-left">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(ex.text, ex.mode)}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 text-sm bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <div className="text-xs text-zinc-400 mb-1">
                {ex.mode === "pro" ? "🔵 업무" : "🟢 일상"}
              </div>
              <div className="text-zinc-700 dark:text-zinc-300">{ex.text}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }
}

function ModeButton({
  current,
  value,
  onChange,
  children,
}: {
  current: AssistantMode;
  value: AssistantMode;
  onChange: (m: AssistantMode) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`text-xs rounded-md px-2.5 py-1 font-medium transition-colors ${
        active
          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
          : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700"
      }`}
    >
      {children}
    </button>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-blue-500 text-white px-4 py-2 text-sm whitespace-pre-wrap break-words">
          {msg.text}
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] flex flex-col gap-1">
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
            msg.isError
              ? "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900"
              : "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700"
          }`}
        >
          {msg.isError && "❌ "}
          {msg.text}
        </div>
        {!msg.isError && msg.modelUsed && (
          <div className="text-[10px] text-zinc-400 px-2">
            {msg.mode === "pro" ? "🔵 Pro" : "🟢 Flash"} ·{" "}
            <span className="font-mono">{msg.modelUsed}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-500 border border-zinc-200 dark:border-zinc-700 inline-flex items-center gap-2">
        <span className="inline-flex gap-1">
          <span className="dot" />
          <span className="dot" style={{ animationDelay: "0.15s" }} />
          <span className="dot" style={{ animationDelay: "0.3s" }} />
        </span>
        <span>생각 중...</span>
        <style>{`
          .dot {
            width: 6px;
            height: 6px;
            border-radius: 9999px;
            background: rgb(161 161 170);
            animation: bounce 0.8s infinite;
          }
          @keyframes bounce {
            0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
            40% { transform: translateY(-4px); opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}

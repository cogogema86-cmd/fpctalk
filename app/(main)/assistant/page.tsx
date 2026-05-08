import { redirect } from "next/navigation";
import { getMe } from "@/lib/chat";
import { AssistantChat } from "./_chat";

export default async function AssistantPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  return (
    <div className="h-[calc(100vh-58px)] flex flex-col">
      {/* 헤더 */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 bg-white dark:bg-black">
        <h1 className="font-semibold text-zinc-900 dark:text-zinc-50">
          AI 비서
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          학원 업무 도우미 · Gemini 2.5 (자동: Flash🟢 일상 / Pro🔵 업무)
        </p>
      </div>

      <AssistantChat userName={me.name} />
    </div>
  );
}

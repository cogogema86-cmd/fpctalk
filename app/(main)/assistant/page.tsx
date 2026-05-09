import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { AssistantChat } from "./_chat";

export default async function AssistantPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { authId: authUser.id },
    include: { role: true },
  });
  if (!me) redirect("/login");

  // 학원장급 (레벨 3+) 만 접근
  if (me.role.defaultLevel < 3) {
    redirect("/dashboard");
  }

  return (
    <div className="h-[calc(100vh-58px)] flex flex-col">
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 bg-white dark:bg-black">
        <h1 className="font-semibold text-zinc-900 dark:text-zinc-50">
          AI 비서 <span className="text-xs text-zinc-400 font-normal ml-1">학원장 전용</span>
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          학원의 모든 채팅을 알고 있는 비서. 일정·약속·과거 대화를 물어보거나 업무를 시킬 수 있습니다.
          (Korean / English)
        </p>
      </div>

      <AssistantChat userName={me.name} />
    </div>
  );
}

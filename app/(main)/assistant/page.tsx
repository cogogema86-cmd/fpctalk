import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { listTemplates } from "@/lib/documents";
import { AssistantChat } from "./_chat";
import { TemplatesSection } from "./_templates";

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

  if (me.role.defaultLevel < 3) {
    redirect("/dashboard");
  }

  const templates = await listTemplates(me.id);

  return (
    <div className="h-[calc(100vh-58px)] flex flex-col">
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 bg-white dark:bg-black">
        <h1 className="font-semibold text-zinc-900 dark:text-zinc-50">
          AI 비서{" "}
          <span className="text-xs text-zinc-400 font-normal ml-1">
            학원장 전용
          </span>
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          학원의 모든 채팅을 알고 있는 비서 + 양식 보관함
        </p>
      </div>

      {/* 양식 보관함 */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-4 py-3 max-h-[40vh] overflow-y-auto">
        <TemplatesSection
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            koFileName: t.koFileName,
            enFileName: t.enFileName,
            createdAt: t.createdAt.toISOString(),
          }))}
        />
      </div>

      {/* AI 채팅 */}
      <AssistantChat userName={me.name} />
    </div>
  );
}

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { AssistantChat } from "./_chat";
import { getT } from "@/lib/i18n/server";

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

  const t = await getT();

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 bg-white dark:bg-black">
        <h1 className="font-semibold text-zinc-900 dark:text-zinc-50">
          {t("nav.assistant")}{" "}
          <span className="text-xs text-zinc-400 font-normal ml-1">
            {t("ai.principalOnly")}
          </span>
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {t("ai.subtitle")}
        </p>
      </div>

      <AssistantChat userName={me.name} />
    </div>
  );
}

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { TemplateEditForm } from "./_form";
import { getT } from "@/lib/i18n/server";

export default async function TemplateEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { authId: authUser.id },
    include: { role: true },
  });
  if (!me || !me.role.isAdmin) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        관리자 전용 페이지입니다.
      </div>
    );
  }

  const tpl = await prisma.documentTemplate.findUnique({ where: { id } });
  if (!tpl) notFound();

  const t = await getT();

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
      <Link
        href="/documents"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← {t("documents.templateBox")}
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          ✏️ {t("tpl.editTitle")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t("tpl.editSubtitle")}
        </p>
      </div>

      <TemplateEditForm
        template={{
          id: tpl.id,
          name: tpl.name,
          description: tpl.description ?? "",
          koFileName: tpl.koFileName,
          enFileName: tpl.enFileName,
        }}
      />
    </div>
  );
}

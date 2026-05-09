import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { TemplateUploadForm } from "./_form";
import { getT } from "@/lib/i18n/server";

export default async function UploadTemplatePage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { authId: authUser.id },
    include: { role: true },
  });
  const t = await getT();
  if (!me || !me.role.isAdmin) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        {t("docDetail.adminOnly")}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
      <Link
        href="/documents"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        {t("tpl.backToList")}
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {t("upload.title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t("upload.subtitle")}
        </p>
      </div>
      <TemplateUploadForm />
    </div>
  );
}

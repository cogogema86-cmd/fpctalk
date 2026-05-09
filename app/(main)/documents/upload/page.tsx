import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { TemplateUploadForm } from "./_form";

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
  if (!me || !me.role.isAdmin) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        관리자 전용 페이지입니다.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
      <Link
        href="/documents"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← 문서
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          새 양식 업로드
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          자주 쓰는 동의서·신청서 양식을 미리 저장합니다.
          나중에 필요할 때 클릭 한 번으로 직원·학부모에게 사인 요청을 보낼 수 있습니다.
        </p>
      </div>
      <TemplateUploadForm />
    </div>
  );
}

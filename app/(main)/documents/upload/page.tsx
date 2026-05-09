import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { UploadForm } from "./_form";

export default async function UploadDocumentPage() {
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

  // 본인 제외 모든 직원 (대상자 후보)
  const others = await prisma.user.findMany({
    where: { id: { not: me.id } },
    include: { role: { select: { label: true } } },
    orderBy: [{ role: { sortOrder: "asc" } }, { name: "asc" }],
  });

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <Link
        href="/documents"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← 문서 목록
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          문서 업로드 + 사인 요청
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          PDF를 업로드하고 사인을 받을 직원을 선택하세요.
        </p>
      </div>
      <UploadForm
        candidates={others.map((u) => ({
          id: u.id,
          name: u.name,
          username: u.username,
          roleLabel: u.role.label,
        }))}
      />
    </div>
  );
}

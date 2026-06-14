import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { getInfraInventory } from "@/lib/app-settings";
import { InfraEditor } from "./_editor";

export const dynamic = "force-dynamic";

export default async function AdminInfraPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { authId: authUser.id },
    include: { role: { select: { isAdmin: true, canViewStorage: true } } },
  });
  if (!me || !me.role.isAdmin || !me.role.canViewStorage) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        시스템 정보 권한이 있는 최고 관리자만 편집할 수 있습니다.
      </div>
    );
  }

  const services = await getInfraInventory();

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            🔧 인프라 정보 편집
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            계정·서비스 정보를 직접 편집합니다. 저장 시 <b>재배포 없이 즉시</b>{" "}
            대시보드 카드에 반영됩니다.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ← 대시보드
        </Link>
      </div>

      <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3 text-xs text-amber-800 dark:text-amber-200">
        ⚠️ <b>실제 비밀번호·API 키·시크릿은 절대 입력하지 마세요.</b> 여기엔
        서비스명·용도·로그인 주소·계정 식별자·환경변수 <b>이름</b>처럼 비밀이
        아닌 정보만 적습니다. 실제 비밀값은 비밀번호 관리자에 보관하세요.
      </div>

      <InfraEditor initial={services} />
    </div>
  );
}

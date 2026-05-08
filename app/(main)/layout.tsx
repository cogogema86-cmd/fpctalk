import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { LogoutButton } from "./_components/logout-button";
import { Sidebar } from "./_components/sidebar";
import { MobileNav } from "./_components/mobile-nav";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { authId: authUser.id },
    select: { id: true, username: true, name: true, role: true },
  });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm text-center space-y-4">
          <h2 className="text-lg font-semibold">계정 설정이 완료되지 않았습니다</h2>
          <p className="text-sm text-zinc-500">관리자에게 문의해주세요.</p>
          <LogoutButton />
        </div>
      </div>
    );
  }

  const isAdmin = user.role === "PRINCIPAL" || user.role === "VICE";

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-black">
      {/* 헤더 */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center justify-between bg-white dark:bg-black shrink-0">
        <div className="font-semibold text-zinc-900 dark:text-zinc-50">
          FPCTalk
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {user.name}{" "}
            <span className="text-zinc-400">({user.username})</span>
          </span>
          <LogoutButton />
        </div>
      </header>

      {/* 사이드바 + 본문 */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar isAdmin={isAdmin} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      {/* 모바일 하단 네비 */}
      <MobileNav />
    </div>
  );
}

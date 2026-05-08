import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
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
    include: { role: true },
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

  const isAdmin = user.role.isAdmin;

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-black">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center justify-between bg-white dark:bg-black shrink-0">
        <Link href="/dashboard" className="font-semibold text-zinc-900 dark:text-zinc-50">
          FPCTalk
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {user.name}{" "}
            <span className="text-zinc-400">
              ({user.username} · {user.role.label})
            </span>
          </span>
          <Link
            href="/settings/password"
            className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            비번변경
          </Link>
          <LogoutButton />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <Sidebar isAdmin={isAdmin} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      <MobileNav />
    </div>
  );
}

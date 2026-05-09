import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "./_components/logout-button";
import { Sidebar } from "./_components/sidebar";
import { MobileNav } from "./_components/mobile-nav";
import { LocaleToggle } from "./_components/locale-toggle";
import { BadgeSync } from "./_components/badge-sync";
import { ServiceWorkerRegister } from "./_components/sw-register";
import { getLocale, getT } from "@/lib/i18n/server";
import { countChatUnread } from "@/lib/chat";

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

  const locale = await getLocale();
  const t = await getT();

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm text-center space-y-4">
          <h2 className="text-lg font-semibold">
            {locale === "en"
              ? "Account setup is incomplete"
              : "계정 설정이 완료되지 않았습니다"}
          </h2>
          <p className="text-sm text-zinc-500">
            {locale === "en"
              ? "Please contact your administrator."
              : "관리자에게 문의해주세요."}
          </p>
          <LogoutButton />
        </div>
      </div>
    );
  }

  const isAdmin = user.role.isAdmin;
  const userLevel = user.role.defaultLevel;

  const [pendingSignsCount, chatUnreadCount] = await Promise.all([
    prisma.signatureRequest.count({
      where: { signerId: user.id, status: "PENDING" },
    }),
    countChatUnread(user.id),
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-black">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center justify-between bg-white dark:bg-black shrink-0">
        <Link
          href={isAdmin ? "/dashboard" : "/chat"}
          className="font-semibold text-zinc-900 dark:text-zinc-50"
        >
          FPCTalk
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-sm text-zinc-600 dark:text-zinc-400">
            {user.name}{" "}
            <span className="text-zinc-400">
              ({user.username} · {user.role.label})
            </span>
          </span>
          <LocaleToggle current={locale} />
          <Link
            href="/settings/password"
            className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {t("header.changePassword")}
          </Link>
          <LogoutButton />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          isAdmin={isAdmin}
          userLevel={userLevel}
          pendingSignsCount={pendingSignsCount}
          chatUnreadCount={chatUnreadCount}
        />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      <MobileNav
        isAdmin={isAdmin}
        userLevel={userLevel}
        pendingSignsCount={pendingSignsCount}
        chatUnreadCount={chatUnreadCount}
      />

      <BadgeSync
        chatUnread={chatUnreadCount}
        pendingSigns={pendingSignsCount}
      />
      <ServiceWorkerRegister />
    </div>
  );
}

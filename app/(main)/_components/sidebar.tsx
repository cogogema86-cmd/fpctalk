"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: number;
};

export function Sidebar({
  isAdmin,
  userLevel,
  pendingSignsCount,
  chatUnreadCount,
}: {
  isAdmin: boolean;
  userLevel: number;
  pendingSignsCount: number;
  chatUnreadCount: number;
}) {
  const pathname = usePathname();
  const t = useT();
  const showAssistant = userLevel >= 3;

  const baseNav: NavItem[] = [
    ...(isAdmin
      ? [{ href: "/dashboard", label: t("nav.dashboard"), icon: "🏠" }]
      : []),
    {
      href: "/chat",
      label: t("nav.chat"),
      icon: "💬",
      badge: chatUnreadCount > 0 ? chatUnreadCount : undefined,
    },
    {
      href: "/documents",
      label: t("nav.documents"),
      icon: "📄",
      badge: pendingSignsCount > 0 ? pendingSignsCount : undefined,
    },
    { href: "/attendance", label: t("nav.attendance"), icon: "📅" },
    {
      href: "/install",
      label: t("nav.install"),
      icon: "📲",
    },
  ];

  const assistantNav: NavItem = {
    href: "/assistant",
    label: t("nav.assistant"),
    icon: "🤖",
  };

  const adminNav: NavItem[] = [
    { href: "/admin/users", label: t("nav.adminUsers"), icon: "👥" },
    { href: "/admin/roles", label: t("nav.adminRoles"), icon: "🏷️" },
    { href: "/admin/leave", label: t("nav.adminLeave"), icon: "✅" },
  ];

  return (
    <nav className="hidden md:flex w-56 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
      <ul className="flex-1 py-3 space-y-0.5 px-2">
        {baseNav.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}

        {showAssistant && (
          <>
            <li className="pt-4 pb-1 px-3 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {t("nav.principalTools")}
            </li>
            <NavLink
              key={assistantNav.href}
              item={assistantNav}
              pathname={pathname}
            />
          </>
        )}

        {isAdmin && (
          <>
            <li className="pt-4 pb-1 px-3 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {t("nav.adminSection")}
            </li>
            {adminNav.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </>
        )}
      </ul>

      <div className="border-t border-zinc-200 dark:border-zinc-800 px-3 py-3 text-xs text-zinc-400">
        FPCTalk {t("nav.version")}
      </div>
    </nav>
  );
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active =
    pathname === item.href ||
    (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
  return (
    <li>
      <Link
        href={item.href}
        className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
          active
            ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 font-medium"
            : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100"
        }`}
      >
        <span className="text-base">{item.icon}</span>
        <span className="flex-1">{item.label}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full bg-red-500 text-white text-[11px] font-semibold px-1.5">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </Link>
    </li>
  );
}

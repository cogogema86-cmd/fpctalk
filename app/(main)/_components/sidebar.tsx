"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** 우측에 빨간 배지로 표시할 카운트 (있을 때만) */
  badge?: number;
};

// 레벨 3+ 만 보임 (학원장급)
const ASSISTANT_NAV: NavItem = {
  href: "/assistant",
  label: "AI 비서",
  icon: "🤖",
};

const ADMIN_NAV_BASE: NavItem[] = [
  { href: "/admin/users", label: "직원 관리", icon: "👥" },
  { href: "/admin/roles", label: "역할 관리", icon: "🏷️" },
  { href: "/attendance", label: "근태", icon: "📅" },
  { href: "/admin/leave", label: "연차 승인", icon: "✅" },
];

export function Sidebar({
  isAdmin,
  userLevel,
  pendingSignsCount,
}: {
  isAdmin: boolean;
  userLevel: number;
  pendingSignsCount: number;
}) {
  const pathname = usePathname();
  const showAssistant = userLevel >= 3;

  const baseNav: NavItem[] = [
    { href: "/dashboard", label: "대시보드", icon: "🏠" },
    { href: "/chat", label: "채팅", icon: "💬" },
    {
      href: "/documents",
      label: "문서",
      icon: "📄",
      badge: pendingSignsCount > 0 ? pendingSignsCount : undefined,
    },
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
              학원장 도구
            </li>
            <NavLink
              key={ASSISTANT_NAV.href}
              item={ASSISTANT_NAV}
              pathname={pathname}
            />
          </>
        )}

        {isAdmin && (
          <>
            <li className="pt-4 pb-1 px-3 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              관리
            </li>
            {ADMIN_NAV_BASE.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </>
        )}
      </ul>

      <div className="border-t border-zinc-200 dark:border-zinc-800 px-3 py-3 text-xs text-zinc-400">
        FPCTalk v0.1
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

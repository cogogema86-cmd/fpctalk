"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";

type Item = {
  href: string;
  label: string;
  icon: string;
  badge?: number;
};

export function MobileNav({
  isAdmin,
  userLevel,
  pendingSignsCount,
}: {
  isAdmin: boolean;
  userLevel: number;
  pendingSignsCount: number;
}) {
  const pathname = usePathname();
  const t = useT();

  const baseItems: Item[] = [
    { href: "/chat", label: t("nav.chat"), icon: "💬" },
    {
      href: "/documents",
      label: t("nav.documents"),
      icon: "📄",
      badge: pendingSignsCount > 0 ? pendingSignsCount : undefined,
    },
    ...(isAdmin
      ? [{ href: "/dashboard", label: t("nav.home"), icon: "🏠" }]
      : []),
  ];

  const assistantItem: Item = {
    href: "/assistant",
    label: t("nav.assistantShort"),
    icon: "🤖",
  };

  const ITEMS = userLevel >= 3 ? [...baseItems, assistantItem] : baseItems;

  return (
    <nav className="md:hidden border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black flex justify-around">
      {ITEMS.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex flex-col items-center py-2 px-3 text-xs flex-1 ${
              active
                ? "text-zinc-900 dark:text-zinc-50"
                : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="absolute top-1 right-3 inline-flex items-center justify-center min-w-[1.1rem] h-4 rounded-full bg-red-500 text-white text-[10px] font-semibold px-1">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

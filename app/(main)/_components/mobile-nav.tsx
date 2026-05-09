"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = {
  href: string;
  label: string;
  icon: string;
  badge?: number;
};

const ASSISTANT_ITEM: Item = {
  href: "/assistant",
  label: "AI",
  icon: "🤖",
};

export function MobileNav({
  userLevel,
  pendingSignsCount,
}: {
  userLevel: number;
  pendingSignsCount: number;
}) {
  const pathname = usePathname();

  const baseItems: Item[] = [
    { href: "/chat", label: "채팅", icon: "💬" },
    {
      href: "/documents",
      label: "문서",
      icon: "📄",
      badge: pendingSignsCount > 0 ? pendingSignsCount : undefined,
    },
    { href: "/dashboard", label: "홈", icon: "🏠" },
  ];

  const ITEMS = userLevel >= 3 ? [...baseItems, ASSISTANT_ITEM] : baseItems;

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

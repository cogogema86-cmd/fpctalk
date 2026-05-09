"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "홈", icon: "🏠" },
  { href: "/chat", label: "채팅", icon: "💬" },
  { href: "/assistant", label: "AI", icon: "🤖" },
  { href: "/documents", label: "문서", icon: "📄" },
];

export function MobileNav() {
  const pathname = usePathname();
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
            className={`flex flex-col items-center py-2 px-3 text-xs ${
              active
                ? "text-zinc-900 dark:text-zinc-50"
                : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

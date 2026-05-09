"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
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
  chatUnreadCount,
}: {
  isAdmin: boolean;
  userLevel: number;
  pendingSignsCount: number;
  chatUnreadCount: number;
}) {
  const pathname = usePathname();
  const t = useT();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  const baseItems: Item[] = [
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
    ...(isAdmin
      ? [{ href: "/dashboard", label: t("nav.home"), icon: "🏠" }]
      : []),
    { href: "/install", label: t("nav.install"), icon: "📲" },
  ];

  const assistantItem: Item = {
    href: "/assistant",
    label: t("nav.assistantShort"),
    icon: "🤖",
  };

  const ITEMS = userLevel >= 3 ? [...baseItems, assistantItem] : baseItems;

  // 페이지 진입 시 현재 활성 메뉴를 가운데로 스크롤 (가려진 항목으로 이동했을 때 화면에 보이도록)
  useEffect(() => {
    const el = activeRef.current;
    const scroller = scrollerRef.current;
    if (!el || !scroller) return;
    const elRect = el.getBoundingClientRect();
    const sRect = scroller.getBoundingClientRect();
    const target =
      el.offsetLeft - scroller.clientWidth / 2 + elRect.width / 2;
    if (Math.abs(target - scroller.scrollLeft) > 8) {
      scroller.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    }
    void sRect; // unused but kept for clarity
  }, [pathname]);

  return (
    <div className="md:hidden border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black relative">
      <div
        ref={scrollerRef}
        className="overflow-x-auto overflow-y-hidden touch-pan-x [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <ul className="flex justify-around min-w-max">
          {ITEMS.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" &&
                pathname.startsWith(`${item.href}/`));
            return (
              <li
                key={item.href}
                ref={active ? activeRef : null}
                className="shrink-0 min-w-[6.75rem]"
              >
                <Link
                  href={item.href}
                  className={`relative flex flex-col items-center py-3 px-4 text-sm ${
                    active
                      ? "text-zinc-900 dark:text-zinc-50"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  <span className="text-2xl leading-none">{item.icon}</span>
                  <span className="whitespace-nowrap mt-1 text-[13px] font-medium">
                    {item.label}
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute top-1.5 right-2.5 inline-flex items-center justify-center min-w-[1.4rem] h-5 rounded-full bg-red-500 text-white text-[12px] font-semibold px-1.5">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 우측 페이드 — 더 보기 가능 시각적 힌트 */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-black to-transparent" />
    </div>
  );
}

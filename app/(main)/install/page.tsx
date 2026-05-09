import { redirect } from "next/navigation";
import { getMe } from "@/lib/chat";
import { getT } from "@/lib/i18n/server";
import { InstallCards } from "./_install-cards";
import { Diagnostics } from "./_diagnostics";
import { UrlBox } from "./_url-box";

export default async function InstallPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  const t = await getT();

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          📲 {t("install.title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t("install.subtitle")}
        </p>
      </div>

      {/* 미리보기 카드 + URL 복사 */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-4">
        <div className="flex items-center gap-4">
          <img
            src="/icons/icon-192.png"
            alt="FPCTalk"
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl shadow-md shrink-0"
          />
          <div className="min-w-0">
            <div className="font-semibold text-lg">FPCTalk</div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Francis Parker Collegiate
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              {t("install.tapHint")}
            </div>
          </div>
        </div>
        <div className="border-t border-zinc-100 dark:border-zinc-900 pt-4">
          <UrlBox />
        </div>
      </div>

      <InstallCards />

      <Diagnostics />

      <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 p-3 text-xs text-zinc-500">
        {t("install.note")}
      </div>
    </div>
  );
}

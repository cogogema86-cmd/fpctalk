import { redirect } from "next/navigation";
import { getMe } from "@/lib/chat";
import { getT } from "@/lib/i18n/server";
import { InstallButton } from "./_install-button";
import { SubscribeButton } from "./_subscribe-button";

export default async function InstallPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  const t = await getT();

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          📲 {t("install.title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t("install.subtitle")}
        </p>
      </div>

      {/* 미리보기 카드: FPC 아이콘 */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 flex items-center gap-4">
        <img
          src="/icons/icon-192.png"
          alt="FPCTalk"
          className="w-20 h-20 rounded-2xl shadow-md"
        />
        <div>
          <div className="font-semibold text-lg">FPCTalk</div>
          <div className="text-xs text-zinc-500 mt-0.5">
            Francis Parker Collegiate
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {t("install.tapHint")}
          </div>
        </div>
      </div>

      {/* 1단계: 홈 화면 설치 */}
      <section className="space-y-2">
        <h2 className="font-semibold">{t("install.step1Title")}</h2>
        <p className="text-xs text-zinc-500">{t("install.step1Body")}</p>
        <InstallButton />
      </section>

      {/* 2단계: 알림 허용 */}
      <section className="space-y-2">
        <h2 className="font-semibold">{t("install.step2Title")}</h2>
        <p className="text-xs text-zinc-500">{t("install.step2Body")}</p>
        <SubscribeButton />
      </section>

      {/* 3단계: 아이콘 / 바로가기 */}
      <section className="space-y-2">
        <h2 className="font-semibold">{t("install.step3Title")}</h2>
        <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1.5 list-disc pl-5">
          <li>{t("install.step3Item1")}</li>
          <li>{t("install.step3Item2")}</li>
          <li>{t("install.step3Item3")}</li>
        </ul>
        <div className="flex flex-wrap gap-2 pt-2">
          <a
            href="/icons/icon-512.png"
            download="fpctalk-icon-512.png"
            className="text-xs rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            ⬇️ icon-512.png
          </a>
          <a
            href="/icons/icon-192.png"
            download="fpctalk-icon-192.png"
            className="text-xs rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            ⬇️ icon-192.png
          </a>
          <a
            href="/icons/apple-touch-icon.png"
            download="fpctalk-apple-touch-icon.png"
            className="text-xs rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            ⬇️ apple-touch-icon.png
          </a>
        </div>
      </section>

      <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 p-3 text-xs text-zinc-500">
        {t("install.note")}
      </div>
    </div>
  );
}

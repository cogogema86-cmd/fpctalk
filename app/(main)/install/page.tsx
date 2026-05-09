import { redirect } from "next/navigation";
import { getMe } from "@/lib/chat";
import { getT } from "@/lib/i18n/server";
import { InstallButton } from "./_install-button";
import { SubscribeButton } from "./_subscribe-button";
import { IosGuide } from "./_ios-guide";

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

      {/* 미리보기 카드 */}
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

      {/* 1단계: 홈 화면 설치 (iOS는 가이드 항상 표시) */}
      <section className="space-y-2">
        <h2 className="font-semibold">{t("install.step1Title")}</h2>
        <p className="text-xs text-zinc-500">{t("install.step1Body")}</p>
        <InstallButton />
        <IosGuide />
      </section>

      {/* 2단계: 알림 허용 */}
      <section className="space-y-2">
        <h2 className="font-semibold">{t("install.step2Title")}</h2>
        <p className="text-xs text-zinc-500">{t("install.step2Body")}</p>
        <SubscribeButton />
      </section>

      <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 p-3 text-xs text-zinc-500">
        {t("install.note")}
      </div>
    </div>
  );
}

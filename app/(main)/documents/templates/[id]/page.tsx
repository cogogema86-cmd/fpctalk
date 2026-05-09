import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { DeleteTemplateButton } from "../../_delete-template-button";
import { getLocale, getT } from "@/lib/i18n/server";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { authId: authUser.id },
    include: { role: true },
  });
  const t = await getT();
  const locale = await getLocale();
  const dateLocale = locale === "en" ? "en-US" : "ko-KR";
  if (!me || !me.role.isAdmin) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        {t("docDetail.adminOnly")}
      </div>
    );
  }

  const tpl = await prisma.documentTemplate.findUnique({
    where: { id },
  });
  if (!tpl) notFound();
  if (tpl.uploaderId !== me.id) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        {t("tpl.notMine")}
      </div>
    );
  }

  // 이 양식으로 만들어진 캠페인들
  const campaigns = await prisma.document.findMany({
    where: { templateId: id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { signatureRequests: true } },
      signatureRequests: { select: { status: true } },
    },
  });

  // 양식 파일 다운로드 URL
  const koUrl = `/api/files/${tpl.id}?type=template&lang=ko`;
  const enUrl = tpl.enPath
    ? `/api/files/${tpl.id}?type=template&lang=en`
    : null;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-5">
      <Link
        href="/documents"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        {t("tpl.backToList")}
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          📁 {tpl.name}
        </h1>
        {tpl.description && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {tpl.description}
          </p>
        )}
        <div className="mt-1 text-xs text-zinc-400">
          {t("tpl.savedAt")} {tpl.createdAt.toLocaleDateString(dateLocale)}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href={`/documents/templates/${tpl.id}/request`}
          className="rounded-md bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 text-sm font-medium"
        >
          {t("tpl.requestFromHere")}
        </Link>
        <DeleteTemplateButton templateId={tpl.id} templateName={tpl.name} />
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold text-sm">{t("tpl.fileSection")}</h2>
        <div className="space-y-1.5">
          <a
            href={koUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium mr-2"
          >
            {t("tpl.dlKo")}
          </a>
          {enUrl && (
            <a
              href={enUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium"
            >
              {t("tpl.dlEn")}
            </a>
          )}
        </div>
        <div className="text-xs text-zinc-500 mt-1 space-x-2">
          <span>🇰🇷 {tpl.koFileName}</span>
          {tpl.enFileName && <span>🇺🇸 {tpl.enFileName}</span>}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">
          {t("tpl.history")} ({campaigns.length})
        </h2>
        {campaigns.length === 0 ? (
          <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center text-sm text-zinc-500">
            {t("tpl.noHistory")}
            <br />
            <Link
              href={`/documents/templates/${tpl.id}/request`}
              className="text-blue-600 dark:text-blue-400 underline mt-2 inline-block"
            >
              {t("tpl.firstRequest")}
            </Link>
          </div>
        ) : (
          <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
            {campaigns.map((c) => {
              const total = c._count.signatureRequests;
              const signed = c.signatureRequests.filter(
                (r) => r.status === "SIGNED",
              ).length;
              return (
                <li
                  key={c.id}
                  className="px-4 py-3 bg-white dark:bg-zinc-950"
                >
                  <Link
                    href={`/documents/${c.id}`}
                    className="block hover:bg-zinc-50 dark:hover:bg-zinc-900 -mx-4 -my-3 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm">
                          {c.createdAt.toLocaleString(dateLocale)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">
                          {signed} / {total}
                        </div>
                        <div className="text-xs text-zinc-400">
                          {t("documents.signedCount")}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

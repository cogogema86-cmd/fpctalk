import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";
import {
  getDocumentsByUploader,
  getMyCompletedSignatures,
  getMyPendingSignatures,
  listTemplates,
} from "@/lib/documents";
import { getLocale, getT } from "@/lib/i18n/server";
import { DeleteTemplateButton } from "./_delete-template-button";
import { PreviewButton } from "./[id]/_preview-button";
import { DownloadButton } from "./[id]/_download-button";

export default async function DocumentsPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const meWithRole = await prisma.user.findUnique({
    where: { id: me.id },
    include: { role: true },
  });
  const isAdmin = !!meWithRole?.role.isAdmin;

  const pending = await getMyPendingSignatures(me.id);
  const completed = await getMyCompletedSignatures(me.id);

  const templates = isAdmin ? await listTemplates(me.id) : [];
  const myDocuments = isAdmin ? await getDocumentsByUploader(me.id) : [];

  const t = await getT();
  const locale = await getLocale();
  const dateLocale = locale === "en" ? "en-US" : "ko-KR";

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {t("documents.title")}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t("documents.subtitle")}
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/documents/upload"
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900"
          >
            {t("documents.newTemplate")}
          </Link>
        )}
      </div>

      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            {t("documents.myPending")} ({pending.length})
          </h2>
          <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
            {pending.map((p) => (
              <li
                key={p.id}
                className="px-4 py-3 bg-white dark:bg-zinc-950 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.document.title}</div>
                  {p.document.description && (
                    <div className="text-xs text-zinc-500 truncate">
                      {p.document.description}
                    </div>
                  )}
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {t("documents.requester")}: {p.requester.name}
                  </div>
                </div>
                <Link
                  href={`/documents/sign/${p.id}`}
                  className="rounded-md bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium px-4 py-2 shrink-0"
                >
                  {t("documents.signNow")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin && (
        <section className="space-y-2">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            {t("documents.templateBox")} ({templates.length})
          </h2>
          {templates.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center text-sm text-zinc-500">
              {t("documents.templateEmpty")}{" "}
              <Link
                href="/documents/upload"
                className="text-blue-600 dark:text-blue-400 underline"
              >
                {t("documents.newTemplate")}
              </Link>
            </div>
          ) : (
            <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
              {templates.map((tpl) => (
                <li
                  key={tpl.id}
                  className="px-4 py-3 bg-white dark:bg-zinc-950 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/documents/templates/${tpl.id}`}
                      className="font-medium hover:underline"
                    >
                      {tpl.name}
                    </Link>
                    {tpl.description && (
                      <div className="text-xs text-zinc-500 truncate mt-0.5">
                        {tpl.description}
                      </div>
                    )}
                    <div className="text-[10px] text-zinc-400 mt-1 space-x-2">
                      <span>🇰🇷 {tpl.koFileName}</span>
                      {tpl.enFileName && <span>🇺🇸 {tpl.enFileName}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link
                      href={`/documents/templates/${tpl.id}/request`}
                      className="text-xs rounded-md bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 font-medium"
                    >
                      {t("documents.requestSignatures")}
                    </Link>
                    <DeleteTemplateButton
                      templateId={tpl.id}
                      templateName={tpl.name}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isAdmin && myDocuments.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            {t("documents.activeCampaigns")} ({myDocuments.length})
          </h2>
          <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
            {myDocuments.map((d) => {
              const total = d._count.signatureRequests;
              const signed = d.signatureRequests.filter(
                (r) => r.status === "SIGNED",
              ).length;
              const isComplete = total > 0 && signed === total;
              return (
                <li
                  key={d.id}
                  className="px-4 py-3 bg-white dark:bg-zinc-950"
                >
                  <Link
                    href={`/documents/${d.id}`}
                    className="block hover:bg-zinc-50 dark:hover:bg-zinc-900 -mx-4 -my-3 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{d.title}</div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          {d.createdAt.toLocaleDateString(dateLocale)}
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-2">
                        {isComplete && (
                          <span className="text-xs text-green-600 dark:text-green-400">
                            {t("documents.completed")}
                          </span>
                        )}
                        <div>
                          <div className="text-sm font-semibold">
                            {signed} / {total}
                          </div>
                          <div className="text-xs text-zinc-400">
                            {t("documents.signedCount")}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!isAdmin && completed.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            {t("documents.mySigned")}
          </h2>
          <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden text-sm">
            {completed.map((c) => (
              <li
                key={c.id}
                className="px-4 py-3 bg-white dark:bg-zinc-950 flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{c.document.title}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    ✓{" "}
                    {c.signedAt &&
                      new Date(c.signedAt).toLocaleString(dateLocale)}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
                  <PreviewButton
                    url={`/api/files/${c.document.id}?type=signed`}
                    title={c.document.title}
                    label={t("documents.preview")}
                    compact
                  />
                  <DownloadButton
                    documentId={c.document.id}
                    type="signed"
                    label={t("documents.downloadSigned")}
                    compact
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!isAdmin && pending.length === 0 && completed.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-12 text-center text-zinc-500">
          <div className="text-4xl mb-2">📄</div>
          <div>{t("documents.empty")}</div>
        </div>
      )}
    </div>
  );
}

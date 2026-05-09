import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { getDocumentDetailForAdmin } from "@/lib/documents";
import { getLocale, getT } from "@/lib/i18n/server";
import { DownloadButton } from "./_download-button";
import { CopyLinkButton } from "./_copy-link-button";
import { CancelSignButton } from "./_cancel-button";
import { PreviewButton } from "./_preview-button";

export default async function DocumentDetailPage({
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

  const statusLabels = {
    PENDING: t("status.pending"),
    SIGNED: t("status.signed"),
    REJECTED: t("status.rejected"),
    CANCELLED: t("status.cancelled"),
  };

  if (!me || !me.role.isAdmin) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        {t("docDetail.adminOnly")}
      </div>
    );
  }

  const doc = await getDocumentDetailForAdmin(id, me.id);
  if (!doc) notFound();

  // 직원 / 외부 분리
  const internal = doc.signatureRequests.filter((r) => r.signerId !== null);
  const external = doc.signatureRequests.filter((r) => r.signerId === null);

  // 직원의 signer 정보를 한 번에 가져오기
  const signerIds = internal
    .map((r) => r.signerId!)
    .filter((id): id is string => !!id);
  const signers = await prisma.user.findMany({
    where: { id: { in: signerIds } },
    select: {
      id: true,
      name: true,
      username: true,
      role: { select: { label: true } },
    },
  });
  const signerMap = new Map(signers.map((s) => [s.id, s]));

  const total = doc.signatureRequests.length;
  const signed = doc.signatureRequests.filter((r) => r.status === "SIGNED").length;
  const pending = total - signed;

  // 사이트 URL (환경변수, 없으면 기본)
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://www.fpctalk.com";

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <Link
        href="/documents"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        {t("docDetail.backToList")}
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {doc.title}
        </h1>
        {doc.description && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {doc.description}
          </p>
        )}
        <div className="mt-1 text-xs text-zinc-400">
          {t("docDetail.uploadDate")} {doc.createdAt.toLocaleDateString(dateLocale)} ·{" "}
          {t("docDetail.pages")} {doc.pageCount ?? "?"}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat
          label={t("docDetail.totalRequests")}
          value={`${total}${t("docDetail.peopleUnit")}`}
        />
        <Stat
          label={t("docDetail.signed")}
          value={`${signed}${t("docDetail.peopleUnit")}`}
          highlight={signed > 0}
        />
        <Stat
          label={t("docDetail.pending")}
          value={`${pending}${t("docDetail.peopleUnit")}`}
        />
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("docDetail.original")}</h2>
        <DownloadButton
          documentId={doc.id}
          type="primary"
          label={t("docDetail.downloadKo")}
        />
        {doc.storagePathEn && (
          <DownloadButton
            documentId={doc.id}
            type="en"
            label={t("docDetail.downloadEn")}
          />
        )}
      </section>

      {/* Staff signatures */}
      {internal.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">
            {t("docDetail.staffSection")} ({internal.length})
          </h2>
          <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
            {internal.map((r) => {
              const s = signerMap.get(r.signerId!);
              return (
                <li
                  key={r.id}
                  className="px-4 py-3 bg-white dark:bg-zinc-950 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {s?.name ?? "—"}{" "}
                      <span className="text-xs text-zinc-500 font-normal">
                        ({s?.username ?? r.signerId} · {s?.role.label ?? "—"})
                      </span>
                    </div>
                    {r.status === "SIGNED" ? (
                      <div className="text-xs text-zinc-500 mt-0.5 space-y-0.5">
                        <div>
                          {t("docDetail.signedAt")}
                          {r.signedAt &&
                            ` · ${new Date(r.signedAt).toLocaleString(dateLocale)}`}
                        </div>
                        {r.signerIp && <div>IP: {r.signerIp}</div>}
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {t("docDetail.waiting")}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
                    <Status status={r.status} labels={statusLabels} />
                    {r.signedPdfPath && (
                      <>
                        <PreviewButton
                          url={`/api/files/${doc.id}?type=signed&signRequestId=${r.id}`}
                          title={`${doc.title} — ${s?.name ?? ""}`}
                          label={t("documents.preview")}
                          compact
                        />
                        <DownloadButton
                          documentId={doc.id}
                          type="signed"
                          signRequestId={r.id}
                          label={t("documents.downloadSigned")}
                          compact
                        />
                      </>
                    )}
                    {r.status === "PENDING" && (
                      <CancelSignButton
                        requestId={r.id}
                        documentId={doc.id}
                        signerLabel={s?.name ?? r.signerId ?? ""}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* External signers */}
      {external.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">
            {t("docDetail.externalSection")} ({external.length})
          </h2>
          <p className="text-xs text-zinc-500">
            {t("docDetail.externalHint")}
          </p>
          <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
            {external.map((r) => {
              const link = r.accessToken
                ? `${baseUrl}/sign/${r.accessToken}`
                : null;
              return (
                <li
                  key={r.id}
                  className="px-4 py-3 bg-white dark:bg-zinc-950 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{r.externalName}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {r.externalEmail ||
                          r.externalPhone ||
                          t("docDetail.noContact")}
                      </div>
                      {r.status === "SIGNED" ? (
                        <div className="text-xs text-zinc-500 mt-0.5 space-y-0.5">
                          <div>
                            {t("docDetail.signedAt")}
                            {r.signedAt &&
                              ` · ${new Date(r.signedAt).toLocaleString(dateLocale)}`}
                          </div>
                          {r.signerIp && <div>IP: {r.signerIp}</div>}
                        </div>
                      ) : r.tokenExpiresAt &&
                        r.tokenExpiresAt < new Date() ? (
                        <div className="text-xs text-red-500 mt-0.5">
                          {t("docDetail.linkExpired")}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-400 mt-0.5">
                          {t("docDetail.expiresAt")}{" "}
                          {r.tokenExpiresAt &&
                            new Date(r.tokenExpiresAt).toLocaleDateString(
                              dateLocale,
                            )}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
                      <Status status={r.status} labels={statusLabels} />
                      {r.signedPdfPath && (
                        <>
                          <PreviewButton
                            url={`/api/files/${doc.id}?type=signed&signRequestId=${r.id}`}
                            title={`${doc.title} — ${r.externalName ?? ""}`}
                            label={t("documents.preview")}
                            compact
                          />
                          <DownloadButton
                            documentId={doc.id}
                            type="signed"
                            signRequestId={r.id}
                            label={t("documents.downloadSigned")}
                            compact
                          />
                        </>
                      )}
                      {r.status === "PENDING" && (
                        <CancelSignButton
                          requestId={r.id}
                          documentId={doc.id}
                          signerLabel={r.externalName ?? ""}
                        />
                      )}
                    </div>
                  </div>
                  {link && r.status === "PENDING" && (
                    <div className="bg-zinc-50 dark:bg-zinc-900 rounded p-2 flex items-center gap-2">
                      <code className="text-xs text-zinc-700 dark:text-zinc-300 truncate flex-1">
                        {link}
                      </code>
                      <CopyLinkButton link={link} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight
          ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/40"
          : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
      }`}
    >
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function Status({
  status,
  labels,
}: {
  status: string;
  labels: {
    PENDING: string;
    SIGNED: string;
    REJECTED: string;
    CANCELLED: string;
  };
}) {
  const cls: Record<string, string> = {
    PENDING:
      "bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200",
    SIGNED:
      "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200",
    REJECTED: "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200",
    CANCELLED:
      "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
  };
  const label = labels[status as keyof typeof labels] ?? labels.PENDING;
  const c = cls[status] ?? cls.PENDING;
  return <span className={`text-xs rounded px-1.5 py-0.5 ${c}`}>{label}</span>;
}

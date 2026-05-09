import { notFound } from "next/navigation";
import { getSignatureRequestByToken } from "@/lib/documents";
import { ExternalSignCanvas } from "./_canvas";
import { getLocale, getT } from "@/lib/i18n/server";
import { LocaleToggle } from "@/app/(main)/_components/locale-toggle";

export const dynamic = "force-dynamic";

export default async function ExternalSignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const req = await getSignatureRequestByToken(token);
  if (!req) notFound();

  const t = await getT();
  const locale = await getLocale();
  const dateLocale = locale === "en" ? "en-US" : "ko-KR";

  const expired = req.tokenExpiresAt && req.tokenExpiresAt < new Date();

  if (req.status === "SIGNED") {
    return (
      <Wrapper title={t("ext.alreadySigned")} locale={locale}>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {req.externalName}
          {t("ext.alreadySignedBody")}
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          {t("ext.processedAt")}{" "}
          {req.signedAt &&
            new Date(req.signedAt).toLocaleString(dateLocale)}
        </p>
      </Wrapper>
    );
  }

  if (expired) {
    return (
      <Wrapper title={t("ext.expiredTitle")} locale={locale}>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("ext.expiredBody")}
        </p>
      </Wrapper>
    );
  }

  const koUrl = `/api/sign-files/${token}?lang=ko`;
  const enUrl = req.document.storagePathEn
    ? `/api/sign-files/${token}?lang=en`
    : null;
  const isPdfKo = req.document.mimeType === "application/pdf";
  const isPdfEn = req.document.mimeTypeEn === "application/pdf";

  return (
    <Wrapper title={req.document.title} locale={locale}>
      <div className="space-y-4">
        <div>
          {req.document.description && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {req.document.description}
            </p>
          )}
          <div className="mt-2 text-xs text-zinc-400">
            {t("ext.requestedBy")} {req.requester.name} ({t("ext.brand")})
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            {t("ext.signTarget")}{" "}
            <span className="font-medium">{req.externalName}</span>
          </div>
        </div>

        <section className="space-y-2">
          <h2 className="font-semibold text-sm">📄 {t("sign.title")}</h2>
          <SignFileViewer
            koUrl={koUrl}
            enUrl={enUrl}
            isPdfKo={isPdfKo}
            isPdfEn={isPdfEn}
            openKoLabel={t("ext.openKo")}
            openEnLabel={t("ext.openEn")}
            notPdfBody={t("ext.notPdfBody")}
          />
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-sm">{t("sign.draw")}</h2>
          <p className="text-xs text-zinc-500">{t("sign.drawHint")}</p>
          <ExternalSignCanvas
            token={token}
            signerName={req.externalName ?? ""}
          />
        </section>

        <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 p-3 text-xs text-zinc-500">
          {t("ext.legal1")}
          <br />
          {t("ext.legal2")}
        </div>
      </div>
    </Wrapper>
  );
}

function SignFileViewer({
  koUrl,
  enUrl,
  isPdfKo,
  openKoLabel,
  openEnLabel,
  notPdfBody,
}: {
  koUrl: string;
  enUrl: string | null;
  isPdfKo: boolean;
  isPdfEn: boolean;
  openKoLabel: string;
  openEnLabel: string;
  notPdfBody: string;
}) {
  const url = koUrl;
  const isPdf = isPdfKo;
  return (
    <div className="space-y-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium"
      >
        {openKoLabel}
      </a>
      {enUrl && (
        <a
          href={enUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block ml-2 rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium"
        >
          {openEnLabel}
        </a>
      )}
      {isPdf ? (
        <iframe
          src={url}
          className="w-full h-72 md:h-96 border border-zinc-200 dark:border-zinc-800 rounded-md bg-white"
          title="document"
        />
      ) : (
        <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center text-sm text-zinc-500 bg-zinc-50 dark:bg-zinc-900">
          <div className="text-3xl mb-2">📎</div>
          {notPdfBody}
        </div>
      )}
    </div>
  );
}

async function Wrapper({
  title,
  locale,
  children,
}: {
  title: string;
  locale: "ko" | "en";
  children: React.ReactNode;
}) {
  const t = await getT();
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-4">
      <div className="max-w-2xl mx-auto py-8 space-y-4">
        <div className="flex justify-end">
          <LocaleToggle current={locale} />
        </div>
        <header className="text-center space-y-1">
          <div className="text-xs text-zinc-400">{t("ext.brand")}</div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {title}
          </h1>
        </header>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6">
          {children}
        </div>
        <footer className="text-center text-xs text-zinc-400">
          {t("ext.footer")}
        </footer>
      </div>
    </div>
  );
}

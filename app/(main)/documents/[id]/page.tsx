import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { getDocumentDetailForAdmin } from "@/lib/documents";
import { DownloadButton } from "./_download-button";

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
  if (!me || !me.role.isAdmin) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        관리자 전용 페이지입니다.
      </div>
    );
  }

  const doc = await getDocumentDetailForAdmin(id, me.id);
  if (!doc) notFound();

  const total = doc.signatureRequests.length;
  const signed = doc.signatureRequests.filter((r) => r.status === "SIGNED").length;
  const pending = total - signed;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <Link
        href="/documents"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← 문서 목록
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
          업로드 {doc.createdAt.toLocaleDateString("ko-KR")} · 페이지{" "}
          {doc.pageCount ?? "?"}
        </div>
      </div>

      {/* 진행 상태 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="요청" value={`${total}명`} />
        <Stat label="사인 완료" value={`${signed}명`} highlight={signed > 0} />
        <Stat label="대기" value={`${pending}명`} />
      </div>

      {/* 원본 PDF */}
      <section className="space-y-2">
        <h2 className="font-semibold">원본 문서</h2>
        <DownloadButton
          storagePath={doc.storagePath}
          label="📄 원본 PDF 다운로드"
        />
      </section>

      {/* 사인 요청 목록 */}
      <section className="space-y-2">
        <h2 className="font-semibold">사인 진행 상황</h2>
        <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
          {doc.signatureRequests.map((r) => {
            const fmtDate = r.signedAt
              ? new Date(r.signedAt).toLocaleString("ko-KR")
              : null;
            return (
              <li
                key={r.id}
                className="px-4 py-3 bg-white dark:bg-zinc-950 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {r.signer.name}{" "}
                    <span className="text-xs text-zinc-500 font-normal">
                      ({r.signer.username} · {r.signer.role.label})
                    </span>
                  </div>
                  {r.status === "SIGNED" ? (
                    <div className="text-xs text-zinc-500 mt-0.5 space-y-0.5">
                      <div>✓ 사인 완료 {fmtDate && `· ${fmtDate}`}</div>
                      {r.signerIp && <div>IP: {r.signerIp}</div>}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-400 mt-0.5">대기 중</div>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <Status status={r.status} />
                  {r.signedPdfPath && (
                    <DownloadButton
                      storagePath={r.signedPdfPath}
                      label="📥 사인본"
                      compact
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
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

function Status({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING: {
      label: "대기",
      cls: "bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200",
    },
    SIGNED: {
      label: "완료",
      cls: "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200",
    },
    REJECTED: {
      label: "거부",
      cls: "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200",
    },
    CANCELLED: {
      label: "취소",
      cls: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
    },
  };
  const s = map[status] ?? map.PENDING;
  return (
    <span className={`text-xs rounded px-1.5 py-0.5 ${s.cls}`}>{s.label}</span>
  );
}

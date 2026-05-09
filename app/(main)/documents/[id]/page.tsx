import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { getDocumentDetailForAdmin } from "@/lib/documents";
import { DownloadButton } from "./_download-button";
import { CopyLinkButton } from "./_copy-link-button";

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

      <div className="grid grid-cols-3 gap-3">
        <Stat label="전체 요청" value={`${total}명`} />
        <Stat label="사인 완료" value={`${signed}명`} highlight={signed > 0} />
        <Stat label="대기" value={`${pending}명`} />
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">원본 문서</h2>
        <DownloadButton
          storagePath={doc.storagePath}
          label="📄 원본 PDF 다운로드"
        />
      </section>

      {/* 직원 사인 진행 */}
      {internal.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">🧑‍💼 직원 사인 ({internal.length})</h2>
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
                          ✓ 사인 완료
                          {r.signedAt &&
                            ` · ${new Date(r.signedAt).toLocaleString("ko-KR")}`}
                        </div>
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
      )}

      {/* 외부 사인자 */}
      {external.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">
            👨‍👩‍👧 외부 사인자 ({external.length})
          </h2>
          <p className="text-xs text-zinc-500">
            아래 링크를 카톡/메시지/이메일로 학부모에게 전달하면 회원가입 없이 사인할 수 있습니다.
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
                        {r.externalEmail || r.externalPhone || "연락처 없음"}
                      </div>
                      {r.status === "SIGNED" ? (
                        <div className="text-xs text-zinc-500 mt-0.5 space-y-0.5">
                          <div>
                            ✓ 사인 완료
                            {r.signedAt &&
                              ` · ${new Date(r.signedAt).toLocaleString("ko-KR")}`}
                          </div>
                          {r.signerIp && <div>IP: {r.signerIp}</div>}
                        </div>
                      ) : r.tokenExpiresAt &&
                        r.tokenExpiresAt < new Date() ? (
                        <div className="text-xs text-red-500 mt-0.5">
                          링크 만료됨
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-400 mt-0.5">
                          만료일{" "}
                          {r.tokenExpiresAt &&
                            new Date(r.tokenExpiresAt).toLocaleDateString("ko-KR")}
                        </div>
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

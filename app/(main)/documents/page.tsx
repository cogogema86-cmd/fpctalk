import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";
import {
  getDocumentsByUploader,
  getMyCompletedSignatures,
  getMyPendingSignatures,
} from "@/lib/documents";

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
  const myDocuments = isAdmin ? await getDocumentsByUploader(me.id) : [];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            문서 + 사인
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            동의서·안내장 PDF 일괄 사인
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/documents/upload"
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900"
          >
            + 문서 업로드 + 사인 요청
          </Link>
        )}
      </div>

      {/* 사인 요청 (모든 사용자) */}
      <section className="space-y-2">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
          내 사인 요청 ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center text-sm text-zinc-500">
            대기 중인 사인 요청이 없습니다.
          </div>
        ) : (
          <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
            {pending.map((p) => (
              <li
                key={p.id}
                className="px-4 py-3 bg-white dark:bg-zinc-950 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {p.document.title}
                  </div>
                  {p.document.description && (
                    <div className="text-xs text-zinc-500 truncate">
                      {p.document.description}
                    </div>
                  )}
                  <div className="text-xs text-zinc-400 mt-0.5">
                    요청자: {p.requester.name} · 페이지 {p.document.pageCount ?? "?"}
                  </div>
                </div>
                <Link
                  href={`/documents/sign/${p.id}`}
                  className="rounded-md bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium px-4 py-2 shrink-0"
                >
                  사인하기 →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 사인 완료 (모든 사용자) */}
      {completed.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            내가 사인한 문서
          </h2>
          <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden text-sm">
            {completed.map((c) => (
              <li key={c.id} className="px-4 py-2 bg-white dark:bg-zinc-950">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{c.document.title}</div>
                  <div className="text-xs text-zinc-400">
                    ✓{" "}
                    {c.signedAt &&
                      new Date(c.signedAt).toLocaleDateString("ko-KR")}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 관리자: 내가 업로드한 문서 */}
      {isAdmin && (
        <section className="space-y-2">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            내가 업로드한 문서
          </h2>
          {myDocuments.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center text-sm text-zinc-500">
              아직 업로드한 문서가 없습니다.
            </div>
          ) : (
            <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
              {myDocuments.map((d) => {
                const total = d._count.signatureRequests;
                const signed = d.signatureRequests.filter(
                  (r) => r.status === "SIGNED",
                ).length;
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
                          {d.description && (
                            <div className="text-xs text-zinc-500 truncate">
                              {d.description}
                            </div>
                          )}
                          <div className="text-xs text-zinc-400 mt-0.5">
                            업로드 {d.createdAt.toLocaleDateString("ko-KR")}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold">
                            {signed} / {total}
                          </div>
                          <div className="text-xs text-zinc-400">사인 완료</div>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

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
import { DeleteTemplateButton } from "./_delete-template-button";

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

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            문서 + 사인
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            동의서·안내장 양식 관리 + 사인 요청
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/documents/upload"
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900"
          >
            + 새 양식 업로드
          </Link>
        )}
      </div>

      {/* 내 사인 요청 (모든 사용자) */}
      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            ✍️ 내 사인 요청 ({pending.length})
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
                    요청자: {p.requester.name}
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
        </section>
      )}

      {/* 관리자: 양식 보관함 */}
      {isAdmin && (
        <section className="space-y-2">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            📁 양식 보관함 ({templates.length})
          </h2>
          {templates.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center text-sm text-zinc-500">
              저장된 양식이 없습니다.{" "}
              <Link
                href="/documents/upload"
                className="text-blue-600 dark:text-blue-400 underline"
              >
                + 새 양식 업로드
              </Link>
            </div>
          ) : (
            <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="px-4 py-3 bg-white dark:bg-zinc-950 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/documents/templates/${t.id}`}
                      className="font-medium hover:underline"
                    >
                      {t.name}
                    </Link>
                    {t.description && (
                      <div className="text-xs text-zinc-500 truncate mt-0.5">
                        {t.description}
                      </div>
                    )}
                    <div className="text-[10px] text-zinc-400 mt-1 space-x-2">
                      <span>🇰🇷 {t.koFileName}</span>
                      {t.enFileName && <span>🇺🇸 {t.enFileName}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link
                      href={`/documents/templates/${t.id}/request`}
                      className="text-xs rounded-md bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 font-medium"
                    >
                      ✍️ 사인 요청
                    </Link>
                    <DeleteTemplateButton
                      templateId={t.id}
                      templateName={t.name}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 관리자: 진행 중인 캠페인 */}
      {isAdmin && myDocuments.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            📋 진행 중인 사인 캠페인 ({myDocuments.length})
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
                          {d.createdAt.toLocaleDateString("ko-KR")}
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-2">
                        {isComplete && (
                          <span className="text-xs text-green-600 dark:text-green-400">
                            ✓ 완료
                          </span>
                        )}
                        <div>
                          <div className="text-sm font-semibold">
                            {signed} / {total}
                          </div>
                          <div className="text-xs text-zinc-400">사인 완료</div>
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

      {/* 직원: 사인 완료한 문서 */}
      {!isAdmin && completed.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            ✓ 내가 사인한 문서
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

      {/* 빈 상태 (직원이 사인할 거 없을 때) */}
      {!isAdmin && pending.length === 0 && completed.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-12 text-center text-zinc-500">
          <div className="text-4xl mb-2">📄</div>
          <div>아직 사인할 문서가 없습니다.</div>
        </div>
      )}
    </div>
  );
}

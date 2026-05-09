import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getMe } from "@/lib/chat";
import {
  getDocumentSignedUrl,
  getSignatureRequestForSigner,
} from "@/lib/documents";
import { SignCanvas } from "./_canvas";

export default async function SignPage({
  params,
}: {
  params: Promise<{ reqId: string }>;
}) {
  const { reqId } = await params;
  const me = await getMe();
  if (!me) redirect("/login");

  const req = await getSignatureRequestForSigner(reqId, me.id);
  if (!req) notFound();

  // 원본 PDF signed URL (5분 유효)
  let pdfUrl: string | null = null;
  try {
    pdfUrl = await getDocumentSignedUrl(req.document.storagePath, 300);
  } catch {
    // 무시
  }

  if (req.status !== "PENDING") {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <Link
          href="/documents"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← 문서 목록
        </Link>
        <div className="rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 p-4 text-sm text-green-800 dark:text-green-200">
          ✅ 이미 사인이 완료된 문서입니다.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <Link
        href="/documents"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← 문서 목록
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {req.document.title}
        </h1>
        {req.document.description && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {req.document.description}
          </p>
        )}
        <div className="mt-1 text-xs text-zinc-400">
          요청자: {req.requester.name} · 페이지 {req.document.pageCount ?? "?"}
        </div>
      </div>

      {/* 문서 보기 */}
      <section className="space-y-2">
        <h2 className="font-semibold text-sm">📄 문서 확인</h2>
        {pdfUrl ? (
          <>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium"
            >
              📥 PDF 새 창에서 열기
            </a>
            <iframe
              src={pdfUrl}
              className="w-full h-96 border border-zinc-200 dark:border-zinc-800 rounded-md bg-white"
              title="문서 미리보기"
            />
          </>
        ) : (
          <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700">
            PDF 링크 발급에 실패했습니다. 새로고침 후 다시 시도해주세요.
          </div>
        )}
      </section>

      {/* 사인 캔버스 */}
      <section className="space-y-2">
        <h2 className="font-semibold text-sm">✍️ 사인</h2>
        <p className="text-xs text-zinc-500">
          아래 영역에 마우스/터치/펜으로 본인 사인을 그려주세요.
        </p>
        <SignCanvas requestId={req.id} />
      </section>

      <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 p-3 text-xs text-zinc-500">
        💡 사인 시 시간·IP·기기 정보가 함께 기록됩니다 (법적 효력 감사 로그).
      </div>
    </div>
  );
}

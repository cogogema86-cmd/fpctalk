import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getMe } from "@/lib/chat";
import { getSignatureRequestForSigner } from "@/lib/documents";
import { SignCanvas } from "./_canvas";
import { LangViewer } from "./_lang-viewer";

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

  // 다운로드 URL은 항상 /api/files 프록시 사용
  // (storageType에 관계없이 동작 — 서버에서 권한 체크 + 적절한 스토리지 라우팅)
  const koUrl = `/api/files/${req.document.id}?type=primary`;
  const enUrl = req.document.storagePathEn
    ? `/api/files/${req.document.id}?type=en`
    : null;

  if (req.status !== "PENDING") {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
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

  const isPdfKo = req.document.mimeType === "application/pdf";
  const isPdfEn = req.document.mimeTypeEn === "application/pdf";

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
      <Link
        href="/documents"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← 문서 목록
      </Link>

      <div>
        <h1 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {req.document.title}
        </h1>
        {req.document.description && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {req.document.description}
          </p>
        )}
        <div className="mt-1 text-xs text-zinc-400">
          요청자: {req.requester.name}
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold text-sm">📄 문서 확인</h2>
        <LangViewer
          koUrl={koUrl}
          enUrl={enUrl}
          isPdfKo={isPdfKo}
          isPdfEn={isPdfEn}
          koFileName={req.document.title}
          enFileName={req.document.title}
        />
      </section>

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

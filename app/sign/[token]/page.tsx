import { notFound } from "next/navigation";
import {
  getDocumentSignedUrl,
  getSignatureRequestByToken,
} from "@/lib/documents";
import { ExternalSignCanvas } from "./_canvas";

export const dynamic = "force-dynamic";

export default async function ExternalSignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const req = await getSignatureRequestByToken(token);
  if (!req) notFound();

  const expired =
    req.tokenExpiresAt && req.tokenExpiresAt < new Date();

  // 이미 사인 완료
  if (req.status === "SIGNED") {
    return (
      <Wrapper title="✅ 이미 사인이 완료되었습니다">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {req.externalName}님의 사인이 정상적으로 접수되었습니다.
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          처리 시각:{" "}
          {req.signedAt &&
            new Date(req.signedAt).toLocaleString("ko-KR")}
        </p>
      </Wrapper>
    );
  }

  if (expired) {
    return (
      <Wrapper title="⏱ 링크가 만료되었습니다">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          이 사인 링크는 사용 기한이 지났습니다. 학원에 새 링크를 요청해주세요.
        </p>
      </Wrapper>
    );
  }

  // PDF signed URL
  let pdfUrl: string | null = null;
  try {
    pdfUrl = await getDocumentSignedUrl(req.document.storagePath, 600);
  } catch {
    // ignore
  }

  return (
    <Wrapper title={req.document.title}>
      <div className="space-y-4">
        <div>
          {req.document.description && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {req.document.description}
            </p>
          )}
          <div className="mt-2 text-xs text-zinc-400">
            요청자: {req.requester.name} (Francis Parker 학원)
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            사인 대상: <span className="font-medium">{req.externalName}</span>
          </div>
        </div>

        {/* PDF 미리보기 */}
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
          <ExternalSignCanvas
            token={token}
            signerName={req.externalName ?? ""}
          />
        </section>

        <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 p-3 text-xs text-zinc-500">
          💡 사인 시 시간·IP·기기 정보가 함께 기록됩니다 (법적 효력 감사 로그).
          <br />
          링크는 1회용이며 사인 후 자동으로 만료됩니다.
        </div>
      </div>
    </Wrapper>
  );
}

function Wrapper({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-4">
      <div className="max-w-2xl mx-auto py-8 space-y-4">
        <header className="text-center space-y-1">
          <div className="text-xs text-zinc-400">FPCTalk · Francis Parker 학원</div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {title}
          </h1>
        </header>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6">
          {children}
        </div>
        <footer className="text-center text-xs text-zinc-400">
          이 사인 페이지는 학원에서 발급한 링크로만 접근 가능합니다.
        </footer>
      </div>
    </div>
  );
}

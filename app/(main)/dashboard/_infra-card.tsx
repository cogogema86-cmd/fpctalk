import Link from "next/link";
import type { InfraService } from "@/lib/infra-info";

/**
 * 인프라 정보 카드 (원장 전용) — 비밀이 아닌 정보만.
 * 계정 변경·점검·재현 시 "무엇이 어디에 있는지" 참고용.
 * 기본 접힘(<details>) — 평소 대시보드를 깔끔하게 유지.
 * 내용은 DB에 저장되며 /admin/infra 에서 편집(재배포 불필요).
 */
export function InfraCard({ services }: { services: InfraService[] }) {
  return (
    <details className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 group">
      <summary className="cursor-pointer list-none p-4 flex items-center justify-between">
        <span className="font-semibold text-zinc-900 dark:text-zinc-50">
          🔧 인프라 정보 (계정·서비스)
        </span>
        <span className="text-xs text-zinc-400 group-open:hidden">
          펼치기 ▾
        </span>
        <span className="text-xs text-zinc-400 hidden group-open:inline">
          접기 ▴
        </span>
      </summary>

      <div className="px-4 pb-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 flex-1">
            계정 변경·점검·재현 시 참고용입니다. 🔒 표시 항목의 실제 키·비밀번호는
            여기 없으며 <b>비밀번호 관리자</b>에 보관하세요. (자세한 셋업은 코드의{" "}
            <code className="text-[11px]">SETUP_GUIDE.md</code> 참고)
          </p>
          <Link
            href="/admin/infra"
            className="shrink-0 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ✏️ 편집
          </Link>
        </div>

        {services.length === 0 && (
          <p className="text-sm text-zinc-400">
            등록된 인프라 정보가 없습니다. 편집에서 추가하세요.
          </p>
        )}

        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
          {services.map((s) => (
            <div key={s.name} className="py-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-medium text-zinc-800 dark:text-zinc-100">
                  {s.icon} {s.name}
                  <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                    {s.purpose}
                  </span>
                </div>
                {s.loginUrl && (
                  <a
                    href={s.loginUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                  >
                    로그인 ↗
                  </a>
                )}
              </div>

              {s.identifiers.length > 0 && (
                <div className="text-xs text-zinc-600 dark:text-zinc-300 flex flex-wrap gap-x-4 gap-y-0.5">
                  {s.identifiers.map((id) => (
                    <span key={id.label}>
                      <span className="text-zinc-400">{id.label}:</span>{" "}
                      <span className="font-mono">{id.value}</span>
                    </span>
                  ))}
                </div>
              )}

              {s.envVars.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {s.envVars.map((v) => (
                    <span
                      key={v}
                      className="text-[10px] font-mono rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5"
                    >
                      {v}
                    </span>
                  ))}
                </div>
              )}

              {s.secretNote && (
                <div className="text-[11px] text-amber-700 dark:text-amber-400">
                  🔑 {s.secretNote}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

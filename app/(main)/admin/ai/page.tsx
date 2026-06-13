import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import {
  getAiModels,
  getGeminiApiKeyStatus,
  DEFAULT_AI_MODEL,
} from "@/lib/app-settings";
import { AiSettingsForm } from "./_form";
import { ApiKeySection } from "./_api-key";

export const dynamic = "force-dynamic";

export default async function AdminAiPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { authId: authUser.id },
    include: { role: { select: { isAdmin: true } } },
  });
  if (!me || !me.role.isAdmin) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-zinc-500">
        관리자만 접근할 수 있습니다.
      </div>
    );
  }

  const models = await getAiModels();
  const keyStatus = await getGeminiApiKeyStatus();

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          🤖 AI 모델 설정
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          제미나이 모델명이 바뀌어도 여기서 바꿔 저장하면 <b>재배포 없이 즉시</b>{" "}
          다음 AI 응답부터 적용됩니다. 저장 전 <b>연결 테스트</b>로 모델이
          작동하는지 확인하세요.
        </p>
      </div>

      <AiSettingsForm
        initialFast={models.fast}
        initialPro={models.pro}
        defaultModel={DEFAULT_AI_MODEL}
      />

      <ApiKeySection source={keyStatus.source} hint={keyStatus.hint} />

      <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 text-xs text-zinc-500 dark:text-zinc-400 space-y-1.5">
        <div className="font-semibold text-zinc-600 dark:text-zinc-300">
          참고
        </div>
        <div>
          • <b>빠른 모델(Fast)</b>: 일상 대화·간단 질문에 사용 (빠르고 저렴).
        </div>
        <div>
          • <b>정밀 모델(Pro)</b>: 복잡한 업무·긴 맥락 질문에 사용. 둘을 같게
          둬도 됩니다.
        </div>
        <div>
          • 모델명은 구글이 발급하는 정확한 이름을 입력하세요 (예:
          <code className="mx-1">gemini-3.1-flash-lite</code>,
          <code className="mx-1">gemini-2.5-flash</code>,
          <code className="mx-1">gemini-2.5-pro</code>).
        </div>
        <div>• 비워두면 환경변수 → 기본값으로 자동 폴백됩니다.</div>
      </div>
    </div>
  );
}

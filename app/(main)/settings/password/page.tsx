import { ChangePasswordForm } from "./_form";

export default function ChangePasswordPage() {
  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          비밀번호 변경
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          관리자가 발급한 임시 비밀번호 또는 기존 비밀번호를 본인이 원하는
          비밀번호로 변경할 수 있습니다.
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}

import { ChangePasswordForm } from "./_form";
import { getT } from "@/lib/i18n/server";

export default async function ChangePasswordPage() {
  const t = await getT();
  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {t("pw.title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t("pw.subtitle")}
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}

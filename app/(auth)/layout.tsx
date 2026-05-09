import { LocaleToggle } from "@/app/(main)/_components/locale-toggle";
import { getLocale } from "@/lib/i18n/server";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black px-4 relative">
      <div className="absolute top-4 right-4">
        <LocaleToggle current={locale} />
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

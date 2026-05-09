"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { type Locale } from "@/lib/i18n/dictionary";
import { LOCALE_COOKIE } from "@/lib/i18n/server";

export async function setLocaleAction(locale: Locale): Promise<void> {
  const c = await cookies();
  c.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  type DictKey,
  type Locale,
  translate,
} from "./dictionary";

export const LOCALE_COOKIE = "locale";

export async function getLocale(): Promise<Locale> {
  const c = await cookies();
  const v = c.get(LOCALE_COOKIE)?.value;
  return v === "en" ? "en" : v === "ko" ? "ko" : DEFAULT_LOCALE;
}

export async function getT(): Promise<(key: DictKey) => string> {
  const locale = await getLocale();
  return (key: DictKey) => translate(locale, key);
}

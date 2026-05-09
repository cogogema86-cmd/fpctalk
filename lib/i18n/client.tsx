"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  type DictKey,
  type Locale,
  translate,
} from "./dictionary";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): (key: DictKey) => string {
  const locale = useLocale();
  return useCallback((key: DictKey) => translate(locale, key), [locale]);
}

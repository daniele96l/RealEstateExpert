"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import it from "./locales/it";
import en from "./locales/en";
import type { Translations } from "./locales/it";

export type LocaleId = "it" | "en";

const LOCALES: Record<LocaleId, Translations> = { it, en };
export const LOCALE_STORAGE_KEY = "realestate_locale";

export function isLocaleId(value: string | null | undefined): value is LocaleId {
  return value === "it" || value === "en";
}

export function readStoredLocale(): LocaleId {
  if (typeof window === "undefined") return "it";
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocaleId(raw) ? raw : "it";
  } catch {
    return "it";
  }
}

export function writeStoredLocale(locale: LocaleId): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}

function resolveKey(dict: Translations, key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = dict;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

interface I18nContextValue {
  locale: LocaleId;
  setLocale: (locale: LocaleId) => void;
  t: TFunction;
  ready: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleId>("it");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLocaleState(readStoredLocale());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = locale;
  }, [locale, ready]);

  const setLocale = useCallback((next: LocaleId) => {
    writeStoredLocale(next);
    setLocaleState(next);
  }, []);

  const t = useCallback<TFunction>(
    (key, vars) => {
      const value = resolveKey(LOCALES[locale], key);
      return value ? interpolate(value, vars) : key;
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, ready }),
    [locale, setLocale, t, ready],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

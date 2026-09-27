/**
 * A tiny i18n layer: three dictionaries, a context provider, and a `t()` that
 * walks dotted keys. The choice is remembered in `localStorage` and reflected
 * on `<html lang>`.
 */
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { en, zhCN, zhTW, type Dictionary } from "./dictionaries";

export const LOCALES = ["en", "zh-TW", "zh-CN"] as const;
export type Locale = (typeof LOCALES)[number];

const DICTIONARIES: Record<Locale, Dictionary> = { en, "zh-TW": zhTW, "zh-CN": zhCN };

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "zh-TW": "繁體中文",
  "zh-CN": "简体中文",
};

const STORAGE_KEY = "inward.locale";

/** Dotted section.key pairs, e.g. `notes.newNote`. */
export type TranslationKey = {
  [Section in keyof Dictionary]: `${Section & string}.${keyof Dictionary[Section] & string}`;
}[keyof Dictionary];

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /**
   * Look up a dotted key. `vars` fills `{name}` placeholders, which is how
   * counts are phrased — word order differs enough between the three languages
   * that concatenating a number onto a string does not survive translation.
   */
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  labels: Record<Locale, string>;
};

const I18nContext = createContext<I18nValue | null>(null);

function detectLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && (LOCALES as readonly string[]).includes(stored)) {
    return stored as Locale;
  }
  const preferred = navigator.languages ?? [navigator.language];
  for (const language of preferred) {
    if (language.startsWith("zh")) {
      return /TW|HK|MO|Hant/i.test(language) ? "zh-TW" : "zh-CN";
    }
    if (language.startsWith("en")) {
      return "en";
    }
  }
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);

  const value = useMemo<I18nValue>(() => {
    const dictionary = DICTIONARIES[locale];
    return {
      locale,
      setLocale,
      labels: LOCALE_LABELS,
      t: (key: TranslationKey, vars?: Record<string, string | number>) => {
        const [section, entry] = key.split(".") as [keyof Dictionary, string];
        // The dictionary is `as const`, so this is a literal union; widening to
        // `string` is what allows the placeholder pass below.
        const template: string = dictionary[section][entry as never] ?? key;
        if (!vars) {
          return template;
        }
        return template.replace(/\{(\w+)\}/g, (match: string, name: string) =>
          name in vars ? String(vars[name]) : match,
        );
      },
    };
  }, [locale, setLocale]);

  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18nValue {
  const value = use(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return value;
}

import { en, type MessageKey, type Messages } from './en';

export type { MessageKey } from './en';

export interface Locale {
  /** BCP 47 tag used for Intl formatting, e.g. "en-US". */
  readonly tag: string;
  /** Translations; missing keys fall back to English. */
  readonly messages: Partial<Messages>;
}

const locales: Record<string, Locale> = {
  en: { tag: 'en-US', messages: en },
};

let current: Locale = locales.en!;

/** Registers a locale (e.g. a future `fr.ts`). */
export function registerLocale(id: string, locale: Locale): void {
  locales[id] = locale;
}

export function availableLocales(): string[] {
  return Object.keys(locales);
}

export function setLocale(id: string): void {
  current = locales[id] ?? locales.en!;
  if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', current.tag);
}

export function localeTag(): string {
  return current.tag;
}

/** Translates a key, replacing {placeholders} with the given params. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const template = current.messages[key] ?? en[key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** "Monday, November 23, 2026" in the current locale. */
export function formatDayHeading(date: Date): string {
  return new Intl.DateTimeFormat(current.tag, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/** "Nov 23" style short date, used in links to notes. */
export function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat(current.tag, { month: 'short', day: 'numeric' }).format(date);
}

/** Relative "last modified" style date and time. */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat(current.tag, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

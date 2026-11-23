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

type PluralBase = MessageKey extends infer K
  ? K extends `${infer B}.other`
    ? B
    : never
  : never;

/** Picks "<base>.one" / "<base>.other"… with Intl plural rules and fills {count}. */
export function plural(base: PluralBase, count: number, params: Record<string, string | number> = {}): string {
  const rule = new Intl.PluralRules(current.tag).select(count);
  const key = `${base}.${rule}` as MessageKey;
  const fallback = `${base}.other` as MessageKey;
  return t(key in en ? key : fallback, { count, ...params });
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** Dates are always written YYYY-MM-DD, in every language. */
export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "2026-11-23 14:52". */
export function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

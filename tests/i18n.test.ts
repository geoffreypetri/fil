import { afterEach, describe, expect, it } from 'vitest';
import { formatDayHeading, registerLocale, setLocale, t } from '../src/i18n';

describe('i18n', () => {
  afterEach(() => setLocale('en'));

  it('translates keys and fills placeholders', () => {
    expect(t('status.saved')).toBe('saved');
    expect(t('setup.reconnect', { folder: 'Notes' })).toBe('Reconnect to “Notes”');
  });

  it('keeps unknown placeholders untouched', () => {
    expect(t('setup.reconnect')).toBe('Reconnect to “{folder}”');
  });

  it('falls back to English for missing keys in another locale', () => {
    registerLocale('xx', { tag: 'fr-FR', messages: { 'status.saved': 'enregistré' } });
    setLocale('xx');
    expect(t('status.saved')).toBe('enregistré');
    expect(t('status.error')).toBe('error');
  });

  it('formats day headings with Intl in the current locale', () => {
    const date = new Date(2026, 10, 23);
    expect(formatDayHeading(date)).toBe('Monday, November 23, 2026');
    registerLocale('xx', { tag: 'fr-FR', messages: {} });
    setLocale('xx');
    expect(formatDayHeading(date)).toBe('lundi 23 novembre 2026');
  });
});

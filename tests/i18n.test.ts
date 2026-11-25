import { afterEach, describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, registerLocale, setLocale, t } from '../src/i18n';

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

  it('writes dates as YYYY-MM-DD in every language', () => {
    const date = new Date(2026, 10, 3, 9, 5);
    expect(formatDate(date)).toBe('2026-11-03');
    expect(formatDateTime(date)).toBe('2026-11-03 09:05');
    registerLocale('xx', { tag: 'fr-FR', messages: {} });
    setLocale('xx');
    expect(formatDate(date)).toBe('2026-11-03');
  });
});

describe('plurals', () => {
  it('picks the plural form with Intl rules', async () => {
    const { plural } = await import('../src/i18n');
    expect(plural('count.notes', 1)).toBe('1 note');
    expect(plural('count.notes', 12)).toBe('12 notes');
    expect(plural('topic.hidden', 0)).toBe('⋯ 0 hidden notes');
  });
});

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

describe('plurals', () => {
  it('picks the plural form with Intl rules', async () => {
    const { plural } = await import('../src/i18n');
    expect(plural('count.notes', 1)).toBe('1 note');
    expect(plural('count.notes', 12)).toBe('12 notes');
    expect(plural('topic.hidden', 0)).toBe('⋯ 0 hidden notes');
  });
});

describe('date queries', () => {
  it('parses dates typed in the palette', async () => {
    const { parseDateQuery, nearestDay } = await import('../src/model/dateQuery');
    expect(parseDateQuery('today', '2026-11-23')).toBe('2026-11-23');
    expect(parseDateQuery('Yesterday', '2026-11-01')).toBe('2026-10-31');
    expect(parseDateQuery('2026/11/5', '2026-11-23')).toBe('2026-11-05');
    expect(parseDateQuery('2026-02-30', '2026-11-23')).toBeNull();
    expect(parseDateQuery('project', '2026-11-23')).toBeNull();
    expect(nearestDay('2026-11-10', ['2026-11-01', '2026-11-12', '2026-11-20'])).toBe('2026-11-12');
    expect(nearestDay('2026-12-10', ['2026-11-01', '2026-11-12'])).toBe('2026-11-12');
  });
});

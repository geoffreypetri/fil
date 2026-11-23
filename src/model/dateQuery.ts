import { addDays, dayKeyOf, isDayKey, type DayKey } from './paths';

/**
 * Parses a date typed in the palette: "2026-11-20", "2026/11/20", "today", "yesterday".
 * Returns null when the text is not a date.
 */
export function parseDateQuery(query: string, today: DayKey): DayKey | null {
  const text = query.trim().toLowerCase();
  if (text === 'today') return today;
  if (text === 'yesterday') return addDays(today, -1);
  const match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (!match) return null;
  const key = `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`;
  return isDayKey(key) ? key : null;
}

/**
 * The day to show for a requested date: the date itself when it has notes, otherwise the
 * closest following day with notes, otherwise the closest earlier one.
 */
export function nearestDay(target: DayKey, days: readonly DayKey[]): DayKey | null {
  const sorted = [...days].sort();
  return sorted.find((day) => day >= target) ?? sorted[sorted.length - 1] ?? null;
}

export function todayKey(): DayKey {
  return dayKeyOf(new Date());
}

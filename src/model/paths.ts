/** A calendar day in local time, formatted "YYYY-MM-DD". */
export type DayKey = string;

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_PATH = /^(\d{4})\/(\d{2})\/((\d{4})-(\d{2})-(\d{2}))\.md$/;
const SHEET_PATH = /^tags\/([^/]+)\.md$/;

const pad = (value: number): string => String(value).padStart(2, '0');

export function dayKeyOf(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isDayKey(value: string): boolean {
  const match = DAY_KEY.exec(value);
  if (!match) return false;
  return dayKeyOf(dateOfDayKey(value)) === value;
}

/** Local midnight of the given day. */
export function dateOfDayKey(day: DayKey): Date {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, date);
}

/** "HH:MM" in local time. */
export function timeOf(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "2026-11-23" → "2026/11/2026-11-23.md". */
export function dayPath(day: DayKey): string {
  return `${day.slice(0, 4)}/${day.slice(5, 7)}/${day}.md`;
}

/** Returns the day of a canonical day file path, or null for any other file. */
export function parseDayPath(path: string): DayKey | null {
  const match = DAY_PATH.exec(path);
  if (!match) return null;
  const [, year, month, day, fileYear, fileMonth] = match;
  if (year !== fileYear || month !== fileMonth || !isDayKey(day!)) return null;
  return day!;
}

export const TAGS_DIR = 'tags';

export function tagSheetPath(tag: string): string {
  return `${TAGS_DIR}/${tag}.md`;
}

/** Returns the raw file stem of a file in tags/, or null. Validation happens in the tag table. */
export function parseTagSheetPath(path: string): string | null {
  return SHEET_PATH.exec(path)?.[1] ?? null;
}

export function addDays(day: DayKey, delta: number): DayKey {
  const date = dateOfDayKey(day);
  date.setDate(date.getDate() + delta);
  return dayKeyOf(date);
}

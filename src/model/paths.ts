const pad = (value: number): string => String(value).padStart(2, '0');

/** "YYYY-MM-DD" in local time. */
export function dayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "HH:MM" in local time. */
export function timeOf(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const TAGS_DIR = 'tags';

export function tagSheetPath(tag: string): string {
  return `${TAGS_DIR}/${tag}.md`;
}

/** Returns the raw file stem of a file in tags/, or null. Validation happens in the tag table. */
export function parseTagSheetPath(path: string): string | null {
  return /^tags\/([^/]+)\.md$/.exec(path)?.[1] ?? null;
}

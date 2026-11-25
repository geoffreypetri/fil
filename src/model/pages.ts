import { isConflictFile } from '../fs/conflicts';
import { extractLineTags } from './tags';

/**
 * The editor shows one document made of pages. Each page is a Markdown file at the root of the
 * notes folder and starts with a level-1 heading: "# Title" ↔ "Title.md". Text written before
 * the first heading lives in Inbox.md. The order of the pages is kept in index.md.
 */
export const INBOX_NAME = 'Inbox';
export const INBOX_FILE_PATH = 'Inbox.md';
export const INDEX_FILE = 'index.md';
export const TRASH_DIR = '.fil/trash';
export const UNTITLED = 'Untitled';
const MAX_NAME_LENGTH = 120;

/** "# Title" (at least one character of title). "#tag" and "#" alone are not page headings. */
const H1 = /^# +(\S.*?)\s*$/;

/** Returns the title of a level-1 heading line, or null. A closing "#" sequence is dropped. */
export function parseH1(line: string): string | null {
  const match = H1.exec(line);
  if (!match) return null;
  return match[1]!.replace(/\s+#+$/, '').trim() || null;
}

const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f\u007f[\]]/g;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * File name (without ".md") for a page title: tags removed, characters forbidden on Windows,
 * macOS or Linux (and the [ ] | used by wiki links) replaced, length limited.
 */
export function titleToName(title: string): string {
  let text = title;
  for (const match of [...extractLineTags(title)].reverse()) text = text.slice(0, match.from) + text.slice(match.to);
  let name = text
    .replace(FORBIDDEN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  if (name.length > MAX_NAME_LENGTH) name = name.slice(0, MAX_NAME_LENGTH).trim();
  // "Name (2)" would look like a sync conflict copy.
  name = name.replace(/ \((\d+)\)$/, ' $1');
  if (name === '' || name.startsWith('.')) name = name.replace(/^\.+/, '').trim() || UNTITLED;
  if (WINDOWS_RESERVED.test(name)) name = `${name} _`;
  return name;
}

const key = (name: string): string => name.toLocaleLowerCase();

/**
 * Makes a name unique (case-insensitively, as on Windows and macOS) by adding " 2", " 3"…
 * The inbox and the index file names are reserved.
 */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map(key));
  used.add(key(INBOX_NAME));
  used.add(key(INDEX_FILE.slice(0, -3)));
  if (!used.has(key(base))) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!used.has(key(candidate))) return candidate;
  }
}

export function pagePath(name: string): string {
  return `${name}.md`;
}

/**
 * Page name of a file path: Markdown files at the root, except the index and conflict copies.
 * Returns null for anything else (tag sheets, subfolders, other files).
 */
export function pageNameOf(path: string): string | null {
  if (path.includes('/') || !path.toLowerCase().endsWith('.md')) return null;
  if (key(path) === key(INDEX_FILE) || isConflictFile(path)) return null;
  return path.slice(0, -3);
}

export function isInbox(name: string): boolean {
  return key(name) === key(INBOX_NAME);
}

/** Page names listed in index.md ("- [[Name]]" lines), in order, without duplicates. */
export function parseIndex(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*[-*+]\s+\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/.exec(line);
    if (!match) continue;
    const name = match[1]!.trim();
    if (name && !seen.has(key(name))) {
      seen.add(key(name));
      names.push(name);
    }
  }
  return names;
}

export function writeIndex(names: readonly string[]): string {
  return [
    '<!-- Order of the pages shown by Fil. Updated automatically; you can also reorder the lines. -->',
    '',
    ...names.map((name) => `- [[${name}]]`),
    '',
  ].join('\n');
}

/**
 * The display order: the inbox first, then the pages listed in index.md that still exist, then
 * pages missing from the index (created by another tool), oldest modification first.
 */
export function orderPages(
  indexNames: readonly string[],
  files: readonly { readonly name: string; readonly lastModified: number }[],
): string[] {
  const existing = new Map(files.map((file) => [key(file.name), file]));
  const order: string[] = [];
  const placed = new Set<string>();
  const place = (name: string): void => {
    order.push(name);
    placed.add(key(name));
  };
  const inbox = existing.get(key(INBOX_NAME));
  if (inbox) place(inbox.name);
  for (const name of indexNames) {
    const file = existing.get(key(name));
    if (file && !placed.has(key(file.name))) place(file.name);
  }
  [...files]
    .filter((file) => !placed.has(key(file.name)))
    .sort((a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name))
    .forEach((file) => place(file.name));
  return order;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** Where a page goes when its heading is deleted: ".fil/trash/<name> 2026-11-25 194200.md". */
export function trashPath(name: string, date: Date): string {
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${TRASH_DIR}/${name} ${stamp}.md`;
}

/** Text shown for a page file: its own content, with a heading added if the file has none. */
export function pageDisplayText(name: string, text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  if (isInbox(name)) return normalized;
  const firstLine = normalized.split('\n', 1)[0] ?? '';
  return parseH1(firstLine) === null ? `# ${name}${normalized ? `\n${normalized}` : ''}` : normalized;
}

/** File text for page content shown in the editor: every non-empty file ends with a newline. */
export function pageFileText(content: string): string {
  return content === '' ? '' : `${content}\n`;
}

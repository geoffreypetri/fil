import { isMap, isScalar, isSeq, parseDocument, type Document } from 'yaml';
import { isPaletteColor } from './palette';
import { normalizeTag } from './tags';
import { EMPTY_SETTINGS, type TagSettings } from './tagTable';

const OPEN = /^---[ \t]*\r?\n/;
const CLOSE = /^(?:---|\.\.\.)[ \t]*$/;
const STRINGIFY = { flowCollectionPadding: false, lineWidth: 0 } as const;

export interface SplitSheet {
  /** Raw YAML between the fences, or null when the file has no front matter. */
  readonly yaml: string | null;
  /** Everything after the closing fence (or the whole file). */
  readonly body: string;
}

/** Splits "---\n<yaml>\n---\n<body>". A file without a closed front matter is all body. */
export function splitFrontmatter(text: string): SplitSheet {
  const open = OPEN.exec(text);
  if (!open) return { yaml: null, body: text };
  let offset = open[0].length;
  const yamlLines: string[] = [];
  while (offset <= text.length) {
    const newline = text.indexOf('\n', offset);
    const end = newline === -1 ? text.length : newline;
    const line = text.slice(offset, end).replace(/\r$/, '');
    if (CLOSE.test(line)) {
      return { yaml: yamlLines.join('\n'), body: newline === -1 ? '' : text.slice(newline + 1) };
    }
    yamlLines.push(line);
    if (newline === -1) break;
    offset = newline + 1;
  }
  return { yaml: null, body: text };
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string' || typeof v === 'number').map(String);
  if (typeof value === 'string') return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

/** Reads the known parameters. Invalid values are ignored rather than rejected. */
export function parseSettings(yaml: string | null): TagSettings {
  if (yaml === null || yaml.trim() === '') return EMPTY_SETTINGS;
  let data: unknown;
  try {
    data = parseDocument(yaml).toJS();
  } catch {
    return EMPTY_SETTINGS;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return EMPTY_SETTINGS;
  const record = data as Record<string, unknown>;
  const aliases = [
    ...new Set(toStringList(record.aliases).map(normalizeTag).filter((a): a is string => a !== null)),
  ];
  const label = typeof record.label === 'string' && record.label.trim() !== '' ? record.label.trim() : undefined;
  return {
    color: isPaletteColor(record.color) ? record.color : undefined,
    aliases,
    label,
    archived: record.archived === true,
  };
}

export function parseSheet(text: string): { settings: TagSettings; body: string; yaml: string | null } {
  const { yaml, body } = splitFrontmatter(text);
  return { settings: parseSettings(yaml), body, yaml };
}

function setOrDelete(doc: Document, key: string, value: unknown, keepWhenEmpty = false): void {
  const isEmpty = value === undefined || (Array.isArray(value) && value.length === 0);
  if (isEmpty && !keepWhenEmpty) {
    doc.delete(key);
    return;
  }
  if (Array.isArray(value)) {
    const node = doc.createNode(value);
    if (isSeq(node)) node.flow = true;
    doc.set(key, node);
    return;
  }
  const existing = doc.get(key, true);
  if (isScalar(existing)) existing.value = value;
  else doc.set(key, value);
}

/**
 * Rewrites only the front matter of a sheet with new settings. The body, unknown keys,
 * key order and comments are preserved. A front matter left empty is removed.
 */
export function writeSettings(text: string, settings: TagSettings): string {
  const { yaml, body } = splitFrontmatter(text);
  const doc = parseDocument(yaml ?? '');
  if (doc.errors.length > 0) throw new Error(`Invalid front matter: ${doc.errors[0]!.message}`);
  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as unknown as typeof doc.contents;

  setOrDelete(doc, 'color', settings.color);
  setOrDelete(doc, 'aliases', [...settings.aliases]);
  setOrDelete(doc, 'label', settings.label?.trim() || undefined);
  // "archived: false" is kept when already present, and never added.
  if (settings.archived || doc.has('archived')) setOrDelete(doc, 'archived', settings.archived);

  return composeSheet(isMap(doc.contents) && doc.contents.items.length === 0 && !doc.commentBefore && !doc.comment
    ? null
    : doc.toString(STRINGIFY).replace(/\n$/, ''), body);
}

/** Replaces the body of a sheet, keeping its front matter as is. */
export function writeBody(text: string, body: string): string {
  return composeSheet(splitFrontmatter(text).yaml, body);
}

export function composeSheet(yaml: string | null, body: string): string {
  return yaml === null ? body : `---\n${yaml}\n---\n${body}`;
}

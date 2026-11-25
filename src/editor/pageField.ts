import {
  Annotation,
  StateEffect,
  StateField,
  type EditorState,
  type Text,
  type Transaction,
} from '@codemirror/state';
import { parseH1 } from '../model/pages';
import { codeLines } from '../model/tags';

/**
 * A page of the document: a "# Title" line and everything up to the next one.
 * `name` is the file name (without ".md"), or null while the page has no file yet.
 */
export interface Page {
  readonly id: number;
  readonly name: string | null;
  /** Start of the "# Title" line. */
  readonly from: number;
}

export interface PageRange {
  readonly page: Page;
  readonly from: number;
  /** End of the page content (before the line break that precedes the next page). */
  readonly to: number;
}

let nextId = 1;
export const newPageId = (): number => nextId++;

/** Transactions that mirror the disk (loading, external changes): nothing to save. */
export const fromDisk = Annotation.define<boolean>();

/** Replaces the page list (for programmatic changes, positions in the new document). */
export const setPages = StateEffect.define<readonly Page[]>();

/** Records the file name given to a page. */
export const setPageName = StateEffect.define<{ id: number; name: string }>();

function isPageStart(doc: Text, pos: number): boolean {
  if (pos > doc.length) return false;
  const line = doc.lineAt(pos);
  return line.from === pos && parseH1(line.text) !== null;
}

/** Whether a line is inside a fenced code block, looking back to the start of its page. */
function inCodeBlock(doc: Text, lineNumber: number, pageStartLine: number): boolean {
  const lines: string[] = [];
  for (let n = pageStartLine; n <= lineNumber; n++) lines.push(doc.line(n).text);
  return codeLines(lines)[lines.length - 1] ?? false;
}

/**
 * Follows the pages through user edits: a "# Title" line typed anywhere starts a new page;
 * a page whose heading line was removed or changed into something else disappears (its text
 * then belongs to the previous page).
 */
function updatePages(pages: readonly Page[], tr: Transaction): readonly Page[] {
  const { doc } = tr.state;
  const mapped = pages
    .map((page) => ({ ...page, from: tr.changes.mapPos(page.from, 1) }))
    .filter((page, index, all) => isPageStart(doc, page.from) && all.findIndex((p) => p.from === page.from) === index);

  const starts = new Set(mapped.map((page) => page.from));
  const added: Page[] = [];
  tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    const first = doc.lineAt(fromB).number;
    const last = doc.lineAt(Math.min(toB, doc.length)).number;
    for (let n = first; n <= last; n++) {
      const line = doc.line(n);
      if (starts.has(line.from) || parseH1(line.text) === null) continue;
      const owner = [...mapped, ...added].filter((p) => p.from < line.from).sort((a, b) => b.from - a.from)[0];
      if (inCodeBlock(doc, n, owner ? doc.lineAt(owner.from).number : 1)) continue;
      added.push({ id: newPageId(), name: null, from: line.from });
      starts.add(line.from);
    }
  });
  return [...mapped, ...added].sort((a, b) => a.from - b.from);
}

export const pagesField = StateField.define<readonly Page[]>({
  create: () => [],
  update(pages, tr) {
    let next = pages;
    const explicit = tr.effects.find((e) => e.is(setPages));
    if (explicit) next = explicit.value as readonly Page[];
    else if (tr.docChanged) next = updatePages(pages, tr);
    for (const effect of tr.effects) {
      if (effect.is(setPageName)) {
        next = next.map((page) => (page.id === effect.value.id ? { ...page, name: effect.value.name } : page));
      }
    }
    return next;
  },
});

/** Content ranges of the inbox (text before the first page) and of every page. */
export function pageRanges(state: EditorState): { inbox: { from: number; to: number }; pages: PageRange[] } {
  const pages = state.field(pagesField);
  const length = state.doc.length;
  const first = pages[0];
  return {
    inbox: { from: 0, to: first ? Math.max(0, first.from - 1) : length },
    pages: pages.map((page, index) => {
      const next = pages[index + 1];
      return { page, from: page.from, to: next ? next.from - 1 : length };
    }),
  };
}

export function inboxContent(state: EditorState): string {
  const { inbox } = pageRanges(state);
  return state.doc.sliceString(inbox.from, inbox.to);
}

export function pageContent(state: EditorState, id: number): string | null {
  const range = pageRanges(state).pages.find((r) => r.page.id === id);
  return range ? state.doc.sliceString(range.from, range.to) : null;
}

export function pageByName(state: EditorState, name: string): PageRange | undefined {
  const key = name.toLocaleLowerCase();
  return pageRanges(state).pages.find((r) => r.page.name?.toLocaleLowerCase() === key);
}

/** The page containing a position, or null for the inbox. */
export function pageAt(state: EditorState, pos: number): PageRange | null {
  const ranges = pageRanges(state).pages;
  for (let i = ranges.length - 1; i >= 0; i--) if (ranges[i]!.from <= pos) return ranges[i]!;
  return null;
}

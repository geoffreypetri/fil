import type { EditorState, Transaction, TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/** What PageSync needs from the editor (a real EditorView, or a stand-in in tests). */
export type EditorLike = Pick<EditorView, 'state' | 'hasFocus' | 'dispatch'>;
import {
  fromDisk,
  inboxContent,
  newPageId,
  pageRanges,
  pagesField,
  setPageName,
  setPages,
  type Page,
} from '../editor/pageField';
import type { FileStore } from '../fs/store';
import type { FolderScan } from '../model/folderScan';
import {
  INBOX_NAME,
  INDEX_FILE,
  isInbox,
  orderPages,
  pageDisplayText,
  pageFileText,
  pagePath,
  parseH1,
  parseIndex,
  titleToName,
  trashPath,
  uniqueName,
  writeIndex,
} from '../model/pages';
import type { Saver } from '../sync/saver';

export const INITIAL_PAGES = 30;
const INBOX_KEY = 'inbox';

export interface PageSource {
  readonly name: string;
  /** Text as shown in the editor (see pageDisplayText). */
  readonly content: string;
}

export interface PageSyncOptions {
  readonly delayMs?: number;
  readonly now?: () => Date;
  /** Called when pages have edits waiting to be written, or none anymore. */
  readonly onPending?: (pending: boolean) => void;
  /** Called after a page file was removed (renamed or sent to the trash). */
  readonly onRemoved?: (path: string) => void;
}

const lower = (name: string): string => name.toLocaleLowerCase();

/**
 * Keeps page files in line with the document: one "# Title" ↔ one "Title.md" at the root.
 * - Edits are written to the files of the touched pages, 800 ms after the last change.
 * - A new heading creates a file; changing a title renames it (once the cursor has left the
 *   title line); removing a heading sends its file to .fil/trash/ (its text, still in the
 *   document, now belongs to the previous page).
 * - The order of the pages is kept in index.md; text before the first heading in Inbox.md.
 */
export class PageSync {
  private order: string[] = [];
  private readonly names = new Map<string, string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private indexTimer: ReturnType<typeof setTimeout> | null = null;
  private lastIndexText: string | null = null;
  private queue: Promise<void> = Promise.resolve();
  private view: () => EditorLike | null = () => null;
  private readonly delayMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly store: FileStore,
    private readonly saver: Saver,
    private readonly options: PageSyncOptions = {},
  ) {
    this.delayMs = options.delayMs ?? 800;
    this.now = options.now ?? (() => new Date());
  }

  attach(view: () => EditorLike | null): void {
    this.view = view;
  }

  private state(): EditorState | null {
    return this.view()?.state ?? null;
  }

  // ---- Loading --------------------------------------------------------------------------------

  /** Reads index.md and the last pages; returns the initial document and its pages. */
  async load(scan: FolderScan, count = INITIAL_PAGES): Promise<{ doc: string; pages: Page[] }> {
    let indexNames: string[] = [];
    if (scan.index) {
      try {
        const file = await this.store.read(scan.index.path);
        this.saver.track(INDEX_FILE, file.lastModified, file.text);
        this.lastIndexText = file.text;
        indexNames = parseIndex(file.text);
      } catch {
        // A missing or unreadable index only loses the custom order.
      }
    }
    this.names.clear();
    for (const page of scan.pages) this.names.set(lower(page.name), page.name);
    this.order = orderPages(indexNames, scan.pages);

    const inboxName = this.order.find(isInbox);
    const tail = this.order.filter((name) => !isInbox(name)).slice(-count);
    const inbox = inboxName ? (await this.readPages([inboxName]))[0] : undefined;
    const pages = await this.readPages(tail);
    return buildDocument(inbox?.content ?? '', pages);
  }

  /** Reads page files and records their version for conflict detection. */
  async readPages(names: readonly string[]): Promise<PageSource[]> {
    const sources: PageSource[] = [];
    for (const name of names) {
      try {
        const file = await this.store.read(pagePath(name));
        this.saver.track(file.path, file.lastModified, file.text);
        sources.push({ name, content: pageDisplayText(name, file.text) });
      } catch {
        // Skipped; the watcher will report what changed.
      }
    }
    return sources;
  }

  /** Every page name, in display order (the inbox first). */
  allNames(): readonly string[] {
    return this.order;
  }

  hasPage(name: string): boolean {
    return this.names.has(lower(name));
  }

  /** Names of the pages currently in the editor, in order. */
  loadedNames(): string[] {
    const state = this.state();
    if (!state) return [];
    return state.field(pagesField).flatMap((page) => (page.name ? [page.name] : []));
  }

  /** The `count` pages just before the first page in the editor. */
  olderNames(count: number): string[] {
    const loaded = new Set(this.loadedNames().map(lower));
    const first = this.loadedNames()[0];
    const pages = this.order.filter((name) => !isInbox(name));
    const end = first ? pages.findIndex((name) => lower(name) === lower(first)) : pages.length;
    return pages.slice(0, end < 0 ? pages.length : end).filter((name) => !loaded.has(lower(name))).slice(-count);
  }

  /** Every page from `name` up to the first page in the editor (to keep the document contiguous). */
  namesUpTo(name: string): string[] {
    const pages = this.order.filter((n) => !isInbox(n));
    const loaded = new Set(this.loadedNames().map(lower));
    const start = pages.findIndex((n) => lower(n) === lower(name));
    if (start < 0 || loaded.has(lower(name))) return [];
    return pages.slice(start).filter((n) => !loaded.has(lower(n)));
  }

  // ---- Programmatic changes (loading, external changes) ----------------------------------------

  /** Inserts pages before the first page in the editor (after the inbox). */
  insertBeforeSpec(sources: readonly PageSource[]): TransactionSpec | null {
    const state = this.state();
    if (!state || sources.length === 0) return null;
    const pages = state.field(pagesField);
    const first = pages[0];
    if (!first) return this.appendSpec(sources);
    const at = first.from;
    const added: Page[] = [];
    let offset = at;
    for (const source of sources) {
      added.push({ id: newPageId(), name: source.name, from: offset });
      offset += source.content.length + 1;
    }
    const text = `${sources.map((s) => s.content).join('\n')}\n`;
    return {
      changes: { from: at, insert: text },
      effects: setPages.of([...added, ...pages.map((p) => ({ ...p, from: p.from + text.length }))]),
      annotations: fromDisk.of(true),
    };
  }

  /** Adds pages at the end of the document. */
  appendSpec(sources: readonly PageSource[]): TransactionSpec | null {
    const state = this.state();
    if (!state || sources.length === 0) return null;
    const at = state.doc.length;
    const prefix = at > 0 ? '\n' : '';
    const added: Page[] = [];
    let offset = at + prefix.length;
    for (const source of sources) {
      added.push({ id: newPageId(), name: source.name, from: offset });
      offset += source.content.length + 1;
    }
    return {
      changes: { from: at, insert: prefix + sources.map((s) => s.content).join('\n') },
      effects: setPages.of([...state.field(pagesField), ...added]),
      annotations: fromDisk.of(true),
    };
  }

  /** Replaces the text of a page (or of the inbox) with a version read from disk. */
  replaceSpec(name: string, content: string): TransactionSpec | null {
    const state = this.state();
    if (!state) return null;
    const { inbox, pages } = pageRanges(state);
    const range = isInbox(name) ? { ...inbox, page: null } : pages.find((r) => r.page.name && lower(r.page.name) === lower(name));
    if (!range) return null;
    if (state.doc.sliceString(range.from, range.to) === content) return null;
    let insert = content;
    // An inbox appearing in front of the first page needs its own line.
    if (!range.page && range.from === range.to && pages.length > 0 && pages[0]!.from === 0) insert = `${content}\n`;
    const delta = insert.length - (range.to - range.from);
    return {
      changes: { from: range.from, to: range.to, insert },
      effects: setPages.of(state.field(pagesField).map((p) => (p.from > range.from || (!range.page && p.from >= range.from) ? { ...p, from: p.from + delta } : p))),
      annotations: fromDisk.of(true),
    };
  }

  /** Removes a page whose file was deleted by another tool. */
  removeSpec(name: string): TransactionSpec | null {
    const state = this.state();
    if (!state) return null;
    const range = pageRanges(state).pages.find((r) => r.page.name && lower(r.page.name) === lower(name));
    if (!range) return null;
    const from = range.from > 0 ? range.from - 1 : range.from;
    const to = range.from > 0 ? range.to : Math.min(range.to + 1, state.doc.length);
    const removed = to - from;
    return {
      changes: { from, to },
      effects: setPages.of(
        state.field(pagesField).flatMap((p) => (p.id === range.page.id ? [] : [p.from > range.from ? { ...p, from: p.from - removed } : p])),
      ),
      annotations: fromDisk.of(true),
    };
  }

  /** Records pages that appeared or disappeared on disk. */
  notePageAdded(name: string): void {
    if (this.hasPage(name)) return;
    this.names.set(lower(name), name);
    this.order = isInbox(name) ? [name, ...this.order] : [...this.order, name];
  }

  notePageRemoved(name: string): void {
    this.names.delete(lower(name));
    this.order = this.order.filter((n) => lower(n) !== lower(name));
  }

  // ---- Saving -------------------------------------------------------------------------------

  /** Called for every editor transaction. */
  handleTransaction(tr: Transaction): void {
    if (!tr.docChanged || tr.annotation(fromDisk)) return;
    const before = tr.startState.field(pagesField);
    const after = tr.state.field(pagesField);
    const afterIds = new Set(after.map((p) => p.id));
    const beforeIds = new Set(before.map((p) => p.id));
    const touched = new Set<string>();

    const previousOf = (pages: readonly Page[], from: number): string => {
      const previous = pages.filter((p) => p.from < from).at(-1);
      return previous ? String(previous.id) : INBOX_KEY;
    };

    for (const page of before) {
      if (afterIds.has(page.id)) continue;
      // Its text now belongs to the page before it.
      touched.add(previousOf(after, tr.changes.mapPos(page.from, -1)));
      if (page.name) this.enqueue(() => this.trash(page.name!));
      this.cancel(String(page.id));
    }
    for (const page of after) {
      if (beforeIds.has(page.id)) continue;
      touched.add(String(page.id));
      touched.add(previousOf(after, page.from));
    }

    const { pages } = pageRanges(tr.state);
    tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
      if (pages.length === 0 || fromB < pages[0]!.from) touched.add(INBOX_KEY);
      for (const range of pages) {
        if (fromB <= range.to + 1 && toB >= range.from) touched.add(String(range.page.id));
      }
    });
    for (const key of touched) this.schedule(key);
    if (before.length !== after.length || [...afterIds].some((id) => !beforeIds.has(id))) this.scheduleIndex();
  }

  private schedule(key: string): void {
    this.cancel(key);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.enqueue(() => this.save(key, false));
      }, this.delayMs),
    );
    this.reportPending();
  }

  private cancel(key: string): void {
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
  }

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(task).catch((error: unknown) => {
      console.warn('Saving a page failed', error);
    });
    this.reportPending();
    void this.queue.then(() => this.reportPending());
  }

  private reportPending(): void {
    this.options.onPending?.(this.timers.size > 0 || this.indexTimer !== null);
  }

  hasPending(): boolean {
    return this.timers.size > 0 || this.indexTimer !== null || this.saver.hasPending();
  }

  /** Whether a file has edits waiting to be written. */
  isPending(path: string): boolean {
    if (this.saver.isPending(path)) return true;
    const state = this.state();
    if (!state) return false;
    if (lower(path) === lower(pagePath(INBOX_NAME))) return this.timers.has(INBOX_KEY);
    return state.field(pagesField).some((p) => p.name !== null && lower(pagePath(p.name)) === lower(path) && this.timers.has(String(p.id)));
  }

  /** Writes everything now (title lines included). */
  async flush(): Promise<void> {
    for (const key of [...this.timers.keys()]) {
      this.cancel(key);
      this.enqueue(() => this.save(key, true));
    }
    if (this.indexTimer) {
      clearTimeout(this.indexTimer);
      this.indexTimer = null;
      this.enqueue(() => this.writeOrder());
    }
    await this.queue;
    await this.saver.flush();
    this.reportPending();
  }

  private async save(key: string, force: boolean): Promise<void> {
    const view = this.view();
    if (!view) return;
    const { state } = view;
    if (key === INBOX_KEY) return this.saveInbox(state);

    const id = Number(key);
    const range = pageRanges(state).pages.find((r) => r.page.id === id);
    if (!range) return;
    const { page } = range;
    const content = state.doc.sliceString(range.from, range.to);
    const titleLine = state.doc.lineAt(range.from);
    const title = parseH1(titleLine.text) ?? page.name ?? '';
    const others = [...this.names.values()].filter((n) => !page.name || lower(n) !== lower(page.name));
    let desired = uniqueName(titleToName(title), others);
    // A change of case only is not a rename: on Windows and macOS it is the same file.
    if (page.name && lower(desired) === lower(page.name)) desired = page.name;

    const cursorOnTitle =
      view.hasFocus && state.selection.ranges.some((r) => r.head >= titleLine.from && r.head <= titleLine.to);
    if (desired !== page.name && cursorOnTitle && !force) {
      // Wait until the title is finished: no file per keystroke.
      this.schedule(key);
      return;
    }

    const text = pageFileText(content);
    if (page.name === null) {
      this.names.set(lower(desired), desired);
      view.dispatch({ effects: setPageName.of({ id, name: desired }) });
      await this.saver.writeNow(pagePath(desired), text);
      this.scheduleIndex();
      return;
    }
    if (desired !== page.name) {
      const oldPath = pagePath(page.name);
      this.names.delete(lower(page.name));
      this.names.set(lower(desired), desired);
      view.dispatch({ effects: setPageName.of({ id, name: desired }) });
      await this.saver.writeNow(pagePath(desired), text);
      await this.removeFile(oldPath);
      this.order = this.order.map((n) => (lower(n) === lower(page.name!) ? desired : n));
      this.scheduleIndex();
      return;
    }
    await this.saver.writeNow(pagePath(page.name), text);
  }

  private async saveInbox(state: EditorState): Promise<void> {
    const content = inboxContent(state);
    const exists = this.hasPage(INBOX_NAME);
    if (!exists && content.trim() === '') return;
    await this.saver.writeNow(pagePath(INBOX_NAME), pageFileText(content));
    if (!exists) {
      this.notePageAdded(INBOX_NAME);
      this.scheduleIndex();
    }
  }

  private async removeFile(path: string): Promise<void> {
    if (await this.store.stat(path)) await this.store.remove(path);
    this.saver.track(path, null);
    this.options.onRemoved?.(path);
  }

  /** Moves a page file to .fil/trash/ (its disk version, kept with a time stamp). */
  private async trash(name: string): Promise<void> {
    const path = pagePath(name);
    if (await this.store.stat(path)) {
      const { text } = await this.store.read(path);
      await this.store.write(trashPath(name, this.now()), text);
      await this.removeFile(path);
    }
    this.notePageRemoved(name);
    this.scheduleIndex();
  }

  // ---- Order (index.md) ------------------------------------------------------------------------

  private scheduleIndex(): void {
    if (this.indexTimer) clearTimeout(this.indexTimer);
    this.indexTimer = setTimeout(() => {
      this.indexTimer = null;
      this.enqueue(() => this.writeOrder());
    }, this.delayMs);
    this.reportPending();
  }

  /** The display order: inbox, pages not loaded yet, then the pages of the document. */
  currentOrder(): string[] {
    const loaded = this.loadedNames();
    const loadedKeys = new Set(loaded.map(lower));
    const inbox = this.order.find(isInbox) ?? (this.hasPage(INBOX_NAME) ? INBOX_NAME : undefined);
    const unloaded = this.order.filter((n) => !isInbox(n) && !loadedKeys.has(lower(n)) && this.hasPage(n));
    return [...(inbox ? [inbox] : []), ...unloaded, ...loaded];
  }

  private async writeOrder(): Promise<void> {
    this.order = this.currentOrder();
    const text = writeIndex(this.order);
    if (text === this.lastIndexText) return;
    await this.saver.writeNow(INDEX_FILE, text);
    this.lastIndexText = text;
  }

  /** Adopts an order changed in index.md by another tool or computer. */
  adoptIndex(text: string): void {
    this.lastIndexText = text;
    const existing = [...this.names.values()].map((name) => ({ name, lastModified: 0 }));
    this.order = orderPages(parseIndex(text), existing);
  }
}

/** Builds the document: the inbox, then the pages, one after the other. */
export function buildDocument(inbox: string, pages: readonly PageSource[]): { doc: string; pages: Page[] } {
  const parts: string[] = [];
  const result: Page[] = [];
  let offset = 0;
  if (inbox !== '' || pages.length === 0) {
    parts.push(inbox);
    offset = inbox.length + 1;
  }
  for (const source of pages) {
    result.push({ id: newPageId(), name: source.name, from: offset });
    parts.push(source.content);
    offset += source.content.length + 1;
  }
  return { doc: parts.join('\n'), pages: result };
}

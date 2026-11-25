import type { FileStore } from '../fs/store';
import { t } from '../i18n';
import type { PageSync } from '../journal/pageSync';
import { classifyFiles } from '../model/folderScan';
import { INDEX_FILE, isInbox, pageDisplayText, pageNameOf } from '../model/pages';
import { parseTagSheetPath, tagSheetPath } from '../model/paths';
import { isValidTag } from '../model/tags';
import type { TagService } from '../tags/tagService';
import { diffFolder } from './folderDiff';
import type { Saver } from './saver';
import type { StatusHub } from './status';

export interface WatcherDeps {
  readonly store: FileStore;
  readonly saver: Saver;
  readonly pages: PageSync;
  readonly tags: TagService;
  readonly status: StatusHub;
  /** Applies a transaction spec to the editor, if it exists. */
  dispatch(spec: import('@codemirror/state').TransactionSpec | null): void;
  /** Called when a sheet changed on disk. */
  onSheetChanged(name: string): void;
}

export const POLL_INTERVAL_MS = 30_000;

/**
 * Picks up changes made by other tools or other computers (through the sync service):
 * re-reads modified files when the window regains focus, and every 30 s while visible.
 * Files with unsaved local edits are left to the saver, which keeps a conflict copy.
 * A page created elsewhere appears at the end; one deleted elsewhere leaves the document.
 */
export class ExternalWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private readonly onFocus = (): void => void this.check();
  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'visible') void this.check();
  };

  constructor(private readonly deps: WatcherDeps) {}

  start(): void {
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.timer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.check();
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.timer) clearInterval(this.timer);
  }

  /** Runs one check (never two at once). */
  check(): Promise<void> {
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private known(): Map<string, number> {
    const { saver, tags } = this.deps;
    const known = new Map<string, number>();
    for (const entry of tags.index.all()) known.set(entry.path, saver.knownModified(entry.path) ?? entry.lastModified);
    const index = saver.knownModified(INDEX_FILE);
    if (index !== undefined) known.set(INDEX_FILE, index);
    for (const name of tags.table.sheetNames()) {
      const modified = tags.sheetModified(name);
      if (modified !== null) known.set(tagSheetPath(name), modified);
    }
    return known;
  }

  private async run(): Promise<void> {
    const { store, status } = this.deps;
    let files;
    try {
      files = await store.list();
    } catch (error) {
      status.set('watcher', 'error', [error instanceof Error ? error.message : String(error)]);
      return;
    }
    status.clear('watcher');
    const scan = classifyFiles(files);
    status.set(
      'conflicts',
      'saved',
      scan.conflicts.map((file) => t('warning.conflictFile', { path: file.path })),
    );

    const relevant = [...scan.pages, ...(scan.index ? [scan.index] : []), ...scan.sheets];
    const diff = diffFolder(this.known(), relevant);
    for (const file of [...diff.changed, ...diff.added]) await this.reload(file.path);
    for (const path of diff.removed) this.forget(path);
  }

  private async reload(path: string): Promise<void> {
    const { store, saver, pages, tags } = this.deps;
    // Local edits win; the saver preserves the disk version as a conflict copy when writing.
    if (pages.isPending(path)) return;
    let file;
    try {
      file = await store.read(path);
    } catch {
      return;
    }
    saver.track(path, file.lastModified, file.text);

    if (path === INDEX_FILE) {
      pages.adoptIndex(file.text);
      return;
    }
    const name = pageNameOf(path);
    if (name !== null) {
      tags.updatePage(path, file.text, file.lastModified);
      const content = pageDisplayText(name, file.text);
      const loaded = isInbox(name) || pages.loadedNames().some((n) => n.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (loaded) {
        this.deps.dispatch(pages.replaceSpec(name, content));
      } else if (!pages.hasPage(name)) {
        // A page created elsewhere: shown at the end, like pages missing from index.md.
        pages.notePageAdded(name);
        this.deps.dispatch(pages.appendSpec([{ name, content }]));
      }
      return;
    }
    const sheet = parseTagSheetPath(path);
    if (sheet !== null && isValidTag(sheet)) {
      tags.updateSheet(sheet, file.text, file.lastModified);
      this.deps.onSheetChanged(sheet);
    }
  }

  private forget(path: string): void {
    const { saver, pages, tags } = this.deps;
    if (pages.isPending(path)) return;
    saver.track(path, null);
    const name = pageNameOf(path);
    if (name !== null) {
      tags.index.delete(path);
      pages.notePageRemoved(name);
      this.deps.dispatch(isInbox(name) ? pages.replaceSpec(name, '') : pages.removeSpec(name));
      return;
    }
    const sheet = parseTagSheetPath(path);
    if (sheet !== null) {
      tags.removeSheet(sheet);
      this.deps.onSheetChanged(sheet);
    }
  }
}

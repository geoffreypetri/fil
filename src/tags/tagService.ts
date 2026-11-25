import type { IndexCache } from '../index/cache';
import type { TagIndex } from '../index/tagIndex';
import type { TagCompletion, TagEditorContext } from '../editor/tagContext';
import type { FileStore } from '../fs/store';
import { t } from '../i18n';
import { indexPage } from '../model/pageIndex';
import { pageNameOf } from '../model/pages';
import type { FolderScan } from '../model/folderScan';
import { parseSheet, writeSettings } from '../model/frontmatter';
import type { PaletteColor } from '../model/palette';
import { parseTagSheetPath, tagSheetPath } from '../model/paths';
import { isValidTag } from '../model/tags';
import { TagTable, type SheetRecord, type TagSettings } from '../model/tagTable';
import type { Saver } from '../sync/saver';
import { loadSheets } from './sheets';

interface SheetState {
  text: string;
  lastModified: number;
}

/**
 * Owns the tag table (built from tags/ sheets), keeps the index up to date with written files,
 * and exposes what the editors need through `editorContext`.
 */
export class TagService {
  private tableValue = new TagTable();
  private readonly sheets = new Map<string, SheetState>();
  private invalidSheets: string[] = [];
  private readonly listeners = new Set<() => void>();
  private completionCache: TagCompletion[] | null = null;
  openTag: (name: string, add?: boolean) => void = () => undefined;

  constructor(
    private readonly store: FileStore,
    readonly index: TagIndex,
    private readonly cache: IndexCache,
    private readonly saver: Saver,
    private readonly onWarnings: (messages: string[]) => void = () => undefined,
  ) {
    index.subscribe(() => {
      this.completionCache = null;
    });
  }

  get table(): TagTable {
    return this.tableValue;
  }

  /** Called when the table changes (colors, aliases, labels, archiving). */
  onTableChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  resolve = (raw: string): string => this.tableValue.canonical(raw);

  colorOf(raw: string): PaletteColor {
    return this.tableValue.colorOf(raw);
  }

  // ---- Sheets ---------------------------------------------------------------------------------

  async loadSheets(scan: FolderScan): Promise<void> {
    const { sheets, invalid } = await loadSheets(this.store, scan.sheets);
    this.sheets.clear();
    for (const { record, text } of sheets) {
      this.sheets.set(record.name, { text, lastModified: record.lastModified });
      this.saver.track(record.path, record.lastModified, text);
    }
    this.invalidSheets = invalid;
    this.rebuildTable();
  }

  /** Current text of a sheet, or null when it does not exist. */
  sheetText(name: string): string | null {
    return this.sheets.get(name)?.text ?? null;
  }

  sheetModified(name: string): number | null {
    return this.sheets.get(name)?.lastModified ?? null;
  }

  /** Rewrites the front matter of a sheet (creating it if needed). */
  async saveSettings(name: string, settings: TagSettings): Promise<void> {
    if (!isValidTag(name)) throw new Error(`Invalid tag: ${name}`);
    const text = writeSettings(this.sheetText(name) ?? '', settings);
    await this.saver.writeNow(tagSheetPath(name), text);
  }

  /** Records a sheet change (written by Fil or reloaded from disk). */
  updateSheet(name: string, text: string, lastModified: number): void {
    const previous = this.sheets.get(name);
    this.sheets.set(name, { text, lastModified });
    const settingsChanged =
      !previous || JSON.stringify(parseSheet(previous.text).settings) !== JSON.stringify(parseSheet(text).settings);
    if (settingsChanged) this.rebuildTable();
  }

  removeSheet(name: string): void {
    if (this.sheets.delete(name)) this.rebuildTable();
  }

  private rebuildTable(): void {
    const records: SheetRecord[] = [...this.sheets].map(([name, sheet]) => ({
      name,
      path: tagSheetPath(name),
      lastModified: sheet.lastModified,
      settings: parseSheet(sheet.text).settings,
    }));
    this.tableValue = new TagTable(records);
    this.completionCache = null;
    this.onWarnings([
      ...this.tableValue.conflicts.map((c) => t('warning.aliasConflict', { ...c })),
      ...this.invalidSheets.map((path) => t('warning.invalidSheet', { path })),
    ]);
    for (const listener of this.listeners) listener();
  }

  // ---- Index ----------------------------------------------------------------------------------

  /** Re-indexes a page after it was written or reloaded. */
  updatePage(path: string, text: string, lastModified: number): void {
    const entry = indexPage(path, text, lastModified);
    this.index.set(entry);
    void this.cache.save(this.store.name, [[path, entry]]);
  }

  /** Hook for Saver.onWritten. */
  onFileWritten(path: string, text: string, lastModified: number): void {
    if (pageNameOf(path) !== null) {
      this.updatePage(path, text, lastModified);
      return;
    }
    const sheet = parseTagSheetPath(path);
    if (sheet !== null && isValidTag(sheet)) this.updateSheet(sheet, text, lastModified);
  }

  /** Every primary name: used in notes or with a sheet. */
  allNames(): string[] {
    const usage = this.index.usage(this.resolve);
    return [...new Set([...usage.keys(), ...this.tableValue.sheetNames()])];
  }

  /** Primary names known from notes and sheets, most recently used first. */
  completions(): readonly TagCompletion[] {
    if (this.completionCache) return this.completionCache;
    const table = this.tableValue;
    const usage = this.index.usage(this.resolve);
    const names = new Set([...usage.keys(), ...table.sheetNames()]);
    this.completionCache = [...names]
      .filter((name) => !table.info(name).settings.archived)
      .sort((a, b) => {
        const lastA = usage.get(a)?.lastUsed ?? 0;
        const lastB = usage.get(b)?.lastUsed ?? 0;
        return lastA === lastB ? a.localeCompare(b) : lastA < lastB ? 1 : -1;
      })
      .map((name) => {
        const info = table.info(name);
        return { name, aliases: info.aliases, label: info.settings.label };
      });
    return this.completionCache;
  }

  editorContext(): TagEditorContext {
    return {
      canonical: (raw) => this.resolve(raw),
      colorOf: (raw) => this.colorOf(raw),
      completions: () => this.completions(),
      openTag: (name, add) => this.openTag(name, add),
    };
  }
}

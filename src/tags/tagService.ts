import type { IndexCache } from '../index/cache';
import type { TagIndex } from '../index/tagIndex';
import type { TagCompletion, TagEditorContext } from '../editor/tagContext';
import type { FileStore } from '../fs/store';
import { indexDay } from '../model/dayIndex';
import { hashColor, type PaletteColor } from '../model/palette';
import { dayPath, parseDayPath, type DayKey } from '../model/paths';
import { TagTable } from '../model/tagTable';

/**
 * Owns the tag table (from tags/ sheets) and keeps the index up to date with written files.
 * Exposes what the editors need through `editorContext`.
 */
export class TagService {
  private tableValue = new TagTable();
  private readonly listeners = new Set<() => void>();
  private completionCache: TagCompletion[] | null = null;
  openTag: (name: string) => void = () => undefined;

  constructor(
    private readonly store: FileStore,
    readonly index: TagIndex,
    private readonly cache: IndexCache,
  ) {
    index.subscribe(() => {
      this.completionCache = null;
    });
  }

  get table(): TagTable {
    return this.tableValue;
  }

  setTable(table: TagTable): void {
    this.tableValue = table;
    this.completionCache = null;
    for (const listener of this.listeners) listener();
  }

  /** Called when the table changes (colors, aliases, labels). */
  onTableChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  resolve = (raw: string): string => this.tableValue.canonical(raw);

  colorOf(raw: string): PaletteColor {
    return this.tableValue.colorOf(raw) ?? hashColor(raw);
  }

  /** Re-indexes a day file after it was written or reloaded. */
  updateDay(day: DayKey, text: string, lastModified: number): void {
    const entry = indexDay(day, text, lastModified);
    this.index.set(entry);
    void this.cache.save(this.store.name, [[dayPath(day), entry]]);
  }

  /** Hook for Saver.onWritten. */
  onFileWritten(path: string, text: string, lastModified: number): void {
    const day = parseDayPath(path);
    if (day) this.updateDay(day, text, lastModified);
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
        const lastA = usage.get(a)?.lastUsed ?? '';
        const lastB = usage.get(b)?.lastUsed ?? '';
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
      openTag: (name) => this.openTag(name),
    };
  }
}

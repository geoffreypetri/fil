import { createStore, delMany, entries, setMany } from 'idb-keyval';
import type { DayEntry } from '../model/dayIndex';

/** Persistent cache of day index entries, invalidated by file lastModified. */
export interface IndexCache {
  load(folder: string): Promise<Map<string, DayEntry>>;
  save(folder: string, items: readonly [path: string, entry: DayEntry][]): Promise<void>;
  /** Removes cached entries whose file no longer exists. */
  prune(folder: string, keep: ReadonlySet<string>): Promise<void>;
}

const CACHE_VERSION = 1;
const key = (folder: string, path: string): string => `v${CACHE_VERSION}:${folder}:${path}`;
const prefix = (folder: string): string => `v${CACHE_VERSION}:${folder}:`;

export class IdbIndexCache implements IndexCache {
  private readonly store = createStore('fil-index', 'days');

  async load(folder: string): Promise<Map<string, DayEntry>> {
    const result = new Map<string, DayEntry>();
    const start = prefix(folder);
    try {
      for (const [k, value] of await entries<string, DayEntry>(this.store)) {
        if (typeof k === 'string' && k.startsWith(start)) result.set(k.slice(start.length), value);
      }
    } catch {
      // A broken cache only costs a full re-index.
    }
    return result;
  }

  async save(folder: string, items: readonly [string, DayEntry][]): Promise<void> {
    if (items.length === 0) return;
    await setMany(items.map(([path, entry]) => [key(folder, path), entry]), this.store).catch(() => undefined);
  }

  async prune(folder: string, keep: ReadonlySet<string>): Promise<void> {
    const cached = await this.load(folder);
    const stale = [...cached.keys()].filter((path) => !keep.has(path)).map((path) => key(folder, path));
    if (stale.length > 0) await delMany(stale, this.store).catch(() => undefined);
  }
}

export class MemoryIndexCache implements IndexCache {
  readonly data = new Map<string, DayEntry>();

  async load(folder: string): Promise<Map<string, DayEntry>> {
    const start = prefix(folder);
    const result = new Map<string, DayEntry>();
    for (const [k, value] of this.data) if (k.startsWith(start)) result.set(k.slice(start.length), value);
    return result;
  }

  async save(folder: string, items: readonly [string, DayEntry][]): Promise<void> {
    for (const [path, entry] of items) this.data.set(key(folder, path), entry);
  }

  async prune(folder: string, keep: ReadonlySet<string>): Promise<void> {
    for (const path of (await this.load(folder)).keys()) if (!keep.has(path)) this.data.delete(key(folder, path));
  }
}

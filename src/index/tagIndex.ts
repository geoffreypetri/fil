import type { ActionEntry, NoteEntry, PageEntry } from '../model/pageIndex';

/** Maps a raw tag to its primary name (alias resolution). */
export type Resolve = (raw: string) => string;

export interface NoteRef {
  readonly path: string;
  readonly note: NoteEntry;
}

export interface ActionRef {
  readonly path: string;
  readonly action: ActionEntry;
}

export interface TagUsage {
  /** Number of notes where the tag is written. */
  readonly notes: number;
  /** Most recent modification of a page using the tag. */
  readonly lastUsed: number;
}

/**
 * In-memory index of tags and actions for every page. Stores raw tags; aliases are resolved at
 * query time, so changing an alias never requires re-indexing.
 */
export class TagIndex {
  private readonly pages = new Map<string, PageEntry>();
  private readonly listeners = new Set<() => void>();
  private sorted: PageEntry[] | null = null;

  set(entry: PageEntry): void {
    this.pages.set(entry.path, entry);
    this.changed();
  }

  setMany(entries: Iterable<PageEntry>): void {
    for (const entry of entries) this.pages.set(entry.path, entry);
    this.changed();
  }

  delete(path: string): void {
    if (this.pages.delete(path)) this.changed();
  }

  get(path: string): PageEntry | undefined {
    return this.pages.get(path);
  }

  /** Every indexed page, by path. */
  all(): readonly PageEntry[] {
    this.sorted ??= [...this.pages.values()].sort((a, b) => a.path.localeCompare(b.path));
    return this.sorted;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    this.sorted = null;
    for (const listener of this.listeners) listener();
  }

  /** Every raw tag written in pages. */
  rawTags(): Set<string> {
    const tags = new Set<string>();
    for (const entry of this.pages.values()) for (const note of entry.notes) for (const tag of note.ownTags) tags.add(tag);
    return tags;
  }

  /** Usage per primary name, for sorting completions by recent use. */
  usage(resolve: Resolve): Map<string, TagUsage> {
    const usage = new Map<string, { notes: number; lastUsed: number }>();
    for (const entry of this.pages.values()) {
      for (const note of entry.notes) {
        for (const name of new Set(note.ownTags.map(resolve))) {
          const current = usage.get(name) ?? { notes: 0, lastUsed: 0 };
          current.notes += 1;
          current.lastUsed = Math.max(current.lastUsed, entry.lastModified);
          usage.set(name, current);
        }
      }
    }
    return usage;
  }

  /** Notes to which every given tag (primary names) applies. */
  notesWith(tags: readonly string[], resolve: Resolve): NoteRef[] {
    const result: NoteRef[] = [];
    for (const entry of this.all()) {
      for (const note of entry.notes) {
        const names = new Set(note.tags.map(resolve));
        if (tags.every((tag) => names.has(tag))) result.push({ path: entry.path, note });
      }
    }
    return result;
  }

  /** Actions that belong to every given tag (through their line, paragraph or headings). */
  actionsFor(tags: readonly string[], resolve: Resolve): ActionRef[] {
    const result: ActionRef[] = [];
    for (const entry of this.all()) {
      for (const action of entry.actions) {
        const names = new Set(action.tags.map(resolve));
        if (tags.every((tag) => names.has(tag))) result.push({ path: entry.path, action });
      }
    }
    return result;
  }

  /** Notes and pages whose text contains the raw tag (used by the rename preview). */
  rawTagUsage(raw: string): { notes: number; paths: string[] } {
    let notes = 0;
    const paths: string[] = [];
    for (const entry of this.all()) {
      const count = entry.notes.filter((note) => note.ownTags.includes(raw)).length;
      if (count > 0) {
        notes += count;
        paths.push(entry.path);
      }
    }
    return { notes, paths };
  }
}

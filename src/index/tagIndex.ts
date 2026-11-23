import type { ActionEntry, DayEntry, NoteEntry } from '../model/dayIndex';
import type { DayKey } from '../model/paths';

/** Maps a raw tag to its primary name (alias resolution). */
export type Resolve = (raw: string) => string;

export interface NoteRef {
  readonly day: DayKey;
  readonly note: NoteEntry;
  readonly index: number;
}

export interface ActionRef {
  readonly day: DayKey;
  readonly action: ActionEntry;
  /** Time of the note containing the action. */
  readonly time: string | null;
}

export interface TagUsage {
  /** Number of notes using the tag. */
  readonly notes: number;
  /** Most recent use, as "YYYY-MM-DD HH:MM" for sorting. */
  readonly lastUsed: string;
}

/**
 * In-memory index of tags and actions for every day file. Stores raw tags; aliases are resolved
 * at query time, so changing an alias never requires re-indexing.
 */
export class TagIndex {
  private readonly days = new Map<DayKey, DayEntry>();
  private readonly listeners = new Set<() => void>();
  private sorted: DayEntry[] | null = null;

  set(entry: DayEntry): void {
    this.days.set(entry.day, entry);
    this.changed();
  }

  setMany(entries: Iterable<DayEntry>): void {
    for (const entry of entries) this.days.set(entry.day, entry);
    this.changed();
  }

  delete(day: DayKey): void {
    if (this.days.delete(day)) this.changed();
  }

  get(day: DayKey): DayEntry | undefined {
    return this.days.get(day);
  }

  /** Every indexed day, oldest first. */
  all(): readonly DayEntry[] {
    this.sorted ??= [...this.days.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
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

  /** Every raw tag written in notes. */
  rawTags(): Set<string> {
    const tags = new Set<string>();
    for (const entry of this.days.values()) for (const note of entry.notes) for (const tag of note.tags) tags.add(tag);
    return tags;
  }

  /** Usage per primary name, for sorting completions by recent use. */
  usage(resolve: Resolve): Map<string, TagUsage> {
    const usage = new Map<string, { notes: number; lastUsed: string }>();
    for (const entry of this.all()) {
      for (const note of entry.notes) {
        const stamp = `${entry.day} ${note.time ?? '00:00'}`;
        for (const name of new Set(note.tags.map(resolve))) {
          const current = usage.get(name) ?? { notes: 0, lastUsed: '' };
          current.notes += 1;
          if (stamp > current.lastUsed) current.lastUsed = stamp;
          usage.set(name, current);
        }
      }
    }
    return usage;
  }

  /** Notes containing every given tag (primary names). */
  notesWith(tags: readonly string[], resolve: Resolve): NoteRef[] {
    const result: NoteRef[] = [];
    for (const entry of this.all()) {
      entry.notes.forEach((note, index) => {
        const names = new Set(note.tags.map(resolve));
        if (tags.every((tag) => names.has(tag))) result.push({ day: entry.day, note, index });
      });
    }
    return result;
  }

  /**
   * Actions that belong to every given tag. An action belongs to a tag when its line contains
   * the tag, or when the note containing it does.
   */
  actionsFor(tags: readonly string[], resolve: Resolve): ActionRef[] {
    const result: ActionRef[] = [];
    for (const entry of this.all()) {
      for (const action of entry.actions) {
        const note = entry.notes[action.note];
        const names = new Set([...action.lineTags, ...(note?.tags ?? [])].map(resolve));
        if (tags.every((tag) => names.has(tag))) {
          result.push({ day: entry.day, action, time: note?.time ?? null });
        }
      }
    }
    return result;
  }

  /** Notes and days whose text contains the raw tag (used by the rename preview). */
  rawTagUsage(raw: string): { notes: number; days: DayKey[] } {
    let notes = 0;
    const days: DayKey[] = [];
    for (const entry of this.all()) {
      const count = entry.notes.filter((note) => note.tags.includes(raw)).length;
      if (count > 0) {
        notes += count;
        days.push(entry.day);
      }
    }
    return { notes, days };
  }
}

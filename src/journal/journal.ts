import type { Transaction, TransactionSpec } from '@codemirror/state';
import type { FileStore } from '../fs/store';
import type { FolderScan } from '../model/folderScan';
import { dayPath, type DayKey } from '../model/paths';
import {
  contentToFileText,
  daysInRanges,
  fileTextToContent,
  segmentText,
  type DaySource,
} from '../model/segments';
import { fromDisk, programmatic, segmentContentOf, segmentsOf } from '../editor/segmentField';
import type { EditorState } from '@codemirror/state';
import type { Saver } from '../sync/saver';

export const INITIAL_DAYS = 30;

/**
 * Connects the editor document to day files: loads days and schedules a write of each day
 * touched by an edit. Only the files of the touched days are rewritten.
 */
export class Journal {
  private state: () => EditorState = () => {
    throw new Error('Journal is not attached to an editor');
  };

  constructor(
    private readonly store: FileStore,
    private readonly saver: Saver,
  ) {}

  attach(getState: () => EditorState): void {
    this.state = getState;
  }

  /** Reads the given day files. Unreadable files are skipped and reported by the caller. */
  async readDays(days: readonly DayKey[]): Promise<DaySource[]> {
    const sources: DaySource[] = [];
    for (const day of days) {
      const path = dayPath(day);
      try {
        const file = await this.store.read(path);
        this.saver.track(path, file.lastModified, file.text);
        sources.push({ day, content: fileTextToContent(file.text) });
      } catch {
        this.saver.track(path, null);
      }
    }
    return sources;
  }

  /** The most recent `count` day files, plus an empty segment for today when it has no file. */
  async initialDays(scan: FolderScan, today: DayKey, count = INITIAL_DAYS): Promise<DaySource[]> {
    const existing = scan.days.filter((d) => d.day <= today).slice(-count).map((d) => d.day);
    if (scan.days.some((d) => d.day === today) && !existing.includes(today)) existing.push(today);
    const sources = await this.readDays(existing);
    if (!sources.some((s) => s.day === today)) sources.push({ day: today, content: '' });
    return sources;
  }

  /** Days currently loaded in the editor. */
  loadedDays(): Set<DayKey> {
    return new Set(segmentsOf(this.state()).map((s) => s.day));
  }

  /**
   * Builds the transaction inserting day segments at their chronological place.
   * Days already loaded are skipped.
   */
  insertDaysSpec(sources: readonly DaySource[]): TransactionSpec | null {
    const state = this.state();
    const segments = segmentsOf(state);
    const loaded = new Set(segments.map((s) => s.day));
    const changes: { from: number; insert: string }[] = [];
    for (const source of [...sources].sort((a, b) => (a.day < b.day ? -1 : 1))) {
      if (loaded.has(source.day)) continue;
      loaded.add(source.day);
      const next = segments.find((s) => s.day > source.day);
      if (next) changes.push({ from: next.sentinelFrom, insert: `${segmentText(source)}\n` });
      else changes.push({ from: state.doc.length, insert: `\n${segmentText(source)}` });
    }
    if (changes.length === 0) return null;
    return { changes, annotations: [programmatic.of(true), fromDisk.of(true)] };
  }

  /** Called for every editor transaction. */
  handleTransaction(tr: Transaction): void {
    if (!tr.docChanged || tr.annotation(fromDisk)) return;
    const ranges: { from: number; to: number }[] = [];
    tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => ranges.push({ from: fromB, to: toB }));
    for (const day of daysInRanges(segmentsOf(tr.state), ranges)) this.scheduleSave(day);
  }

  scheduleSave(day: DayKey): void {
    const path = dayPath(day);
    this.saver.schedule(path, () => {
      const content = segmentContentOf(this.state(), day);
      if (content === null) return null;
      // Never create a file for a day that is still empty.
      if (content.trim() === '' && this.saver.knownModified(path) === undefined) return null;
      return contentToFileText(content);
    });
  }
}

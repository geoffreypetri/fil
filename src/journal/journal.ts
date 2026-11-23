import type { Transaction } from '@codemirror/state';
import type { FileStore } from '../fs/store';
import type { FolderScan } from '../model/folderScan';
import { dayPath, type DayKey } from '../model/paths';
import { contentToFileText, daysInRanges, fileTextToContent, type DaySource } from '../model/segments';
import { fromDisk, segmentContentOf, segmentsOf } from '../editor/segmentField';
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
